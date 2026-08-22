import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from './settings';

export interface LicenseStatus {
  activated: boolean;
  valid: boolean;
  status: string; // "active" | "inactive" | "expired" | "disabled" | "none"
  trial: boolean;
  trial_ends_at: string | null;
  expires_at: string | null; // raw license/trial expiry from LS (via Rust)
  customer_name: string | null;
  customer_email: string | null;
  license_key: string | null;
  instance_id?: string | null;
}

// Stronghold Keyring Secret Identifiers
const KEY_LICENSE_KEY = 'ls_license_key';
const KEY_INSTANCE_ID = 'ls_instance_id';
const KEY_LAST_VALIDATED = 'ls_last_validated_at';
const KEY_STATUS = 'ls_license_status';
const KEY_EXPIRES_AT = 'ls_expires_at';
const KEY_CUSTOMER_EMAIL = 'ls_customer_email';
const KEY_CUSTOMER_NAME = 'ls_customer_name';

// 7-day re-validation window for online licenses with a 3-day extra network grace
const REVALIDATE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const OFFLINE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

// Anti-clock-rollback guard.
// We persist the newest trusted wall-clock moment we have validated at. If the system
// clock comes back below that (beyond a small tolerance), the user likely rewound it to
// cheat trace/grace, so the cached license is NOT trusted and a live online check is
// required (offline => lock). Date.now() is UTC-based, so timezone/DST changes don't trip it.
const KEY_MAX_KNOWN_TIME = 'ls_max_known_time';
const ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

// Randomized background re-validation while the app stays open. Delays are chosen
// randomly each retry so the moment is unpredictable (a fixed timer could be gamed by
// blocking the network at that exact instant). We stop as soon as a definite online
// answer is received, so once LS is reached, no further checks happen this launch.
const BACKGROUND_DELAYS_MS = [1000, 2000, 3000, 4000, 5000, 8000, 10000, 15000, 20000, 30000, 60000];
const MAX_BACKGROUND_ATTEMPTS = 10;

// A license is a "trial" when it is active AND carries an end date (from LS expires_at)
// that is still in the future. Lifetime licenses have no end date -> not a trial.
// Unlock requires status "active" AND (no expiry OR expiry still in the future).
interface LicenseEval {
  unlocked: boolean;
  trial: boolean;
}

const expiresToMs = (expiresAt: string | null): number =>
  expiresAt ? new Date(expiresAt).getTime() : 0;

const evaluate = (status: string, expiresAt: string | null, nowMs: number): LicenseEval => {
  const endMs = expiresToMs(expiresAt);
  const isActive = status === 'active';
  const notExpired = endMs === 0 || endMs > nowMs; // no expiry (lifetime) OR still in future
  return {
    unlocked: isActive && notExpired,
    trial: isActive && endMs > 0 && endMs > nowMs,
  };
};

const build = (p: {
  status: string;
  activated: boolean;
  valid: boolean;
  expiresAt: string | null;
  nowMs: number;
  customer_name: string | null;
  customer_email: string | null;
  license_key: string | null;
  instance_id: string | null;
}): LicenseStatus => {
  const { trial } = evaluate(p.status, p.expiresAt, p.nowMs);
  return {
    activated: p.activated,
    valid: p.valid,
    status: p.status,
    trial,
    trial_ends_at: p.expiresAt,
    expires_at: p.expiresAt,
    customer_name: p.customer_name,
    customer_email: p.customer_email,
    license_key: p.license_key,
    instance_id: p.instance_id,
  };
};

export const useLicenseStore = defineStore('license', () => {
  const isLicensed = ref(false);
  const licenseStatus = ref<LicenseStatus | null>(null);
  const isChecking = ref(true);
  const isActivating = ref(false);
  const activationError = ref<string | null>(null);
  // Becomes true once we've reached Lemon Squeezy and gotten a definite answer this launch.
  const onlineResponseReceived = ref(false);

  const settingsStore = useSettingsStore();

  // Remove all license credentials from Stronghold, fully resetting the local license state.
  const wipeLocalCredentials = async () => {
    await settingsStore.saveSecret(KEY_LICENSE_KEY, '');
    await settingsStore.saveSecret(KEY_INSTANCE_ID, '');
    await settingsStore.saveSecret(KEY_LAST_VALIDATED, '');
    await settingsStore.saveSecret(KEY_STATUS, '');
    await settingsStore.saveSecret(KEY_EXPIRES_AT, '');
    await settingsStore.saveSecret(KEY_CUSTOMER_EMAIL, '');
    await settingsStore.saveSecret(KEY_CUSTOMER_NAME, '');
  };

  /**
   * Check encrypted license credentials in the OS Stronghold vault.
   * Access requires an activated Lemon Squeezy license key (no free, unkeyed trial).
   * A key whose license is active and unexpired unlocks the app; a trial/key without a
   * valid activation keeps the app locked at the License Gate.
   */
  const checkLicense = async (): Promise<boolean> => {
    isChecking.value = true;
    activationError.value = null;
    const now = Date.now();

    // Record the newest trusted wall-clock moment (monotonic, never decreases).
    const updateMaxKnownTime = async (t: number) => {
      try {
        const cur = parseInt((await settingsStore.getSecret(KEY_MAX_KNOWN_TIME)) || '0', 10);
        await settingsStore.saveSecret(KEY_MAX_KNOWN_TIME, String(Math.max(cur || 0, t)));
      } catch {
        /* best-effort */
      }
    };

    // Detect a rewound clock. If so, the cached license is untrusted.
    let rolledBack = false;
    try {
      const maxKnownStr = await settingsStore.getSecret(KEY_MAX_KNOWN_TIME);
      const maxKnown = maxKnownStr ? parseInt(maxKnownStr, 10) : 0;
      rolledBack = maxKnown > 0 && now < maxKnown - ROLLBACK_TOLERANCE_MS;
    } catch {
      /* best-effort */
    }

    try {
      // 1. Read encrypted credentials from Stronghold Keyring
      const licenseKey = await settingsStore.getSecret(KEY_LICENSE_KEY);
      const instanceId = await settingsStore.getSecret(KEY_INSTANCE_ID);
      const lastValidatedStr = await settingsStore.getSecret(KEY_LAST_VALIDATED);
      const status = (await settingsStore.getSecret(KEY_STATUS)) || 'active';
      const expiresAt = await settingsStore.getSecret(KEY_EXPIRES_AT);
      const customerEmail = await settingsStore.getSecret(KEY_CUSTOMER_EMAIL);
      const customerName = await settingsStore.getSecret(KEY_CUSTOMER_NAME);

      // CASE A: User has an activated Lemon Squeezy license key
      if (licenseKey && instanceId) {
        const lastValidated = lastValidatedStr ? parseInt(lastValidatedStr, 10) : 0;
        const elapsed = now - lastValidated;

        // Within 7-day re-validation window -> unlock immediately from cache.
        // The cache is trusted only while the clock is honest (no rollback detected).
        if (lastValidated > 0 && elapsed <= REVALIDATE_INTERVAL_MS && !rolledBack) {
          await updateMaxKnownTime(now);
          licenseStatus.value = build({
            status,
            activated: true,
            valid: true,
            expiresAt,
            nowMs: now,
            customer_name: customerName,
            customer_email: customerEmail,
            license_key: licenseKey,
            instance_id: instanceId,
          });
          const unlocked = evaluate(status, expiresAt, now).unlocked;
          isLicensed.value = unlocked;
          return unlocked;
        }

        // Re-validate with Lemon Squeezy API to detect status/expiry changes.
        // (Also the path taken when the clock was clearly rolled back.)
        try {
          const result = await invoke<LicenseStatus>('validate_license_api', {
            licenseKey,
            instanceId,
          });

          if (result && result.valid) {
            await updateMaxKnownTime(now);
            await settingsStore.saveSecret(KEY_LAST_VALIDATED, now.toString());
            await settingsStore.saveSecret(KEY_STATUS, result.status);
            if (result.expires_at) {
              await settingsStore.saveSecret(KEY_EXPIRES_AT, result.expires_at);
            }
            if (result.customer_email) {
              await settingsStore.saveSecret(KEY_CUSTOMER_EMAIL, result.customer_email);
            }
            if (result.customer_name) {
              await settingsStore.saveSecret(KEY_CUSTOMER_NAME, result.customer_name);
            }

            licenseStatus.value = build({
              status: result.status,
              activated: true,
              valid: true,
              expiresAt: result.expires_at,
              nowMs: now,
              customer_name: result.customer_name,
              customer_email: result.customer_email,
              license_key: licenseKey,
              instance_id: instanceId,
            });
            const unlocked = evaluate(result.status, result.expires_at, now).unlocked;
            isLicensed.value = unlocked;
            return unlocked;
          } else {
            // License is confirmed inactive/expired on Lemon Squeezy -> lock and fully reset.
            isLicensed.value = false;
            await wipeLocalCredentials();
            licenseStatus.value = build({
              status: 'none',
              activated: false,
              valid: false,
              expiresAt: null,
              nowMs: now,
              customer_name: null,
              customer_email: null,
              license_key: null,
              instance_id: null,
            });
            return false;
          }
        } catch (networkErr) {
          console.warn('Online license check failed, evaluating offline grace:', networkErr);
          // Offline grace applies only when the clock is honest. A rewound clock gets no grace.
          if (!rolledBack && elapsed <= REVALIDATE_INTERVAL_MS + OFFLINE_GRACE_MS) {
            await updateMaxKnownTime(now);
            licenseStatus.value = build({
              status,
              activated: true,
              valid: true,
              expiresAt,
              nowMs: now,
              customer_name: customerName,
              customer_email: customerEmail,
              license_key: licenseKey,
              instance_id: instanceId,
            });
            const unlocked = evaluate(status, expiresAt, now).unlocked;
            isLicensed.value = unlocked;
            return unlocked;
          } else {
            isLicensed.value = false;
            return false;
          }
        }
      }

      // CASE B: No activated license key -> Locked (no unkeyed trial)
      licenseStatus.value = build({
        status: 'none',
        activated: false,
        valid: false,
        expiresAt: null,
        nowMs: now,
        customer_name: null,
        customer_email: null,
        license_key: null,
        instance_id: null,
      });
      isLicensed.value = false;
      return false;
    } catch (err: any) {
      console.error('Failed to check license status in Stronghold:', err);
      isLicensed.value = false;
      return false;
    } finally {
      isChecking.value = false;
    }
  };

  /**
   * Activate a Lemon Squeezy license key for this machine. Unlocks when the license is
   * active and not expired (trial keys unlock for the trial period).
   */
  const activateLicense = async (key: string): Promise<boolean> => {
    const trimmed = key.trim();
    if (!trimmed) {
      activationError.value = 'Please enter a valid license key.';
      return false;
    }

    isActivating.value = true;
    activationError.value = null;
    try {
      const status = await invoke<LicenseStatus>('activate_license_api', {
        licenseKey: trimmed,
      });

      if (status && status.activated && status.instance_id) {
        // Encrypt and persist all license credentials in Stronghold vault
        const now = Date.now().toString();
        await settingsStore.saveSecret(KEY_LICENSE_KEY, trimmed);
        await settingsStore.saveSecret(KEY_INSTANCE_ID, status.instance_id);
        await settingsStore.saveSecret(KEY_LAST_VALIDATED, now);
        await settingsStore.saveSecret(KEY_STATUS, status.status);
        if (status.expires_at) {
          await settingsStore.saveSecret(KEY_EXPIRES_AT, status.expires_at);
        }
        if (status.customer_email) {
          await settingsStore.saveSecret(KEY_CUSTOMER_EMAIL, status.customer_email);
        }
        if (status.customer_name) {
          await settingsStore.saveSecret(KEY_CUSTOMER_NAME, status.customer_name);
        }

        licenseStatus.value = build({
          status: status.status,
          activated: true,
          valid: true,
          expiresAt: status.expires_at,
          nowMs: Date.now(),
          customer_name: status.customer_name,
          customer_email: status.customer_email,
          license_key: trimmed,
          instance_id: status.instance_id,
        });
        const unlocked = evaluate(status.status, status.expires_at, Date.now()).unlocked;
        isLicensed.value = unlocked;
        return unlocked;
      } else {
        activationError.value = 'License activation failed. Please check your key.';
        return false;
      }
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || 'Activation failed. Please check your key.';
      activationError.value = msg;
      return false;
    } finally {
      isActivating.value = false;
    }
  };

  /**
   * Deactivate current instance with Lemon Squeezy and wipe encrypted credentials from Stronghold.
   * Throws an error if Lemon Squeezy rejects deactivation or if network is unavailable.
   */
  const deactivateLicense = async (): Promise<boolean> => {
    const licenseKey = await settingsStore.getSecret(KEY_LICENSE_KEY);
    const instanceId = await settingsStore.getSecret(KEY_INSTANCE_ID);

    if (licenseKey && instanceId) {
      // Must receive explicit success from Lemon Squeezy
      await invoke('deactivate_license_api', {
        licenseKey,
        instanceId,
      });
    }

    // Wipe all license entries from Stronghold on verified success
    await wipeLocalCredentials();

    licenseStatus.value = null;
    isLicensed.value = false;
    return true;
  };

  /**
   * Force an immediate online synchronization with Lemon Squeezy to detect renewals or status changes.
   */
  const refreshLicense = async (): Promise<boolean> => {
    isChecking.value = true;
    const now = Date.now();
    try {
      const licenseKey = await settingsStore.getSecret(KEY_LICENSE_KEY);
      const instanceId = await settingsStore.getSecret(KEY_INSTANCE_ID);

      // No license credentials (key or machine/instance id) in the vault -> there is nothing
      // to validate against Lemon Squeezy. Stay locked and do NOT hit the API.
      if (!licenseKey || !instanceId) {
        return false;
      }

      const result = await invoke<LicenseStatus>('validate_license_api', {
        licenseKey,
        instanceId,
      });

      if (result && result.valid) {
        onlineResponseReceived.value = true;
        // Advance the anti-rollback marker (monotonic) on a confirmed online check.
        try {
          const cur = parseInt((await settingsStore.getSecret(KEY_MAX_KNOWN_TIME)) || '0', 10);
          await settingsStore.saveSecret(KEY_MAX_KNOWN_TIME, String(Math.max(cur || 0, now)));
        } catch {
          /* best-effort */
        }
        await settingsStore.saveSecret(KEY_LAST_VALIDATED, now.toString());
        await settingsStore.saveSecret(KEY_STATUS, result.status);
        if (result.expires_at) {
          await settingsStore.saveSecret(KEY_EXPIRES_AT, result.expires_at);
        }
        if (result.customer_email) {
          await settingsStore.saveSecret(KEY_CUSTOMER_EMAIL, result.customer_email);
        }
        if (result.customer_name) {
          await settingsStore.saveSecret(KEY_CUSTOMER_NAME, result.customer_name);
        }

        licenseStatus.value = build({
          status: result.status,
          activated: true,
          valid: true,
          expiresAt: result.expires_at,
          nowMs: now,
          customer_name: result.customer_name,
          customer_email: result.customer_email,
          license_key: licenseKey,
          instance_id: instanceId,
        });
        const unlocked = evaluate(result.status, result.expires_at, now).unlocked;
        isLicensed.value = unlocked;
        return unlocked;
      }

      // Confirmed invalid (license deactivated/expired on Lemon Squeezy) -> lock immediately.
      onlineResponseReceived.value = true;
      isLicensed.value = false;
      await wipeLocalCredentials();
      licenseStatus.value = null;
      return false;
    } catch (e) {
      // Network error: keep the cached/offline grace rather than locking a legitimately
      // licensed user who is simply offline right now.
      console.warn('Failed to refresh license status (offline?):', e);
      return isLicensed.value;
    } finally {
      isChecking.value = false;
    }
  };

  /**
   * Kick off randomized background re-validation while the app stays open.
   * - Delays are chosen at random on every retry, so the moment is unpredictable.
   * - It stops the moment a definite online answer arrives (valid, or the license
   *   turned out to be inactive/expired), so we never keep pinging after reaching LS.
   * - If offline, it retries after another random delay, up to a bounded number of tries.
   */
  const startBackgroundRefresh = (): void => {
    if (!isLicensed.value) return;
    let attempts = 0;
    let timer: number | undefined;

    const stop = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const schedule = () => {
      if (onlineResponseReceived.value) {
        stop(); // already got an answer -> make sure no timer is left pending
        return;
      }
      const delay = BACKGROUND_DELAYS_MS[Math.floor(Math.random() * BACKGROUND_DELAYS_MS.length)];
      // TEMP: verify the random refresh timing works as expected; remove before shipping.
      // console.log(`[license] background refresh scheduled in ${delay}ms (attempt ${attempts + 1})`);
      timer = window.setTimeout(async () => {
        await refreshLicense();
        // A definite answer arrived (valid, or inactive/expired -> locked): remove the timer.
        if (onlineResponseReceived.value) {
          // console.log('[license] background refresh got an answer; stopping');
          stop();
          return;
        }
        attempts += 1;
        if (attempts < MAX_BACKGROUND_ATTEMPTS) {
          schedule();
        } else {
          // console.log('[license] background refresh gave up after max attempts');
          stop();
        }
      }, delay);
    };

    schedule();
  };

  /**
   * Cancel/end the trial early. Deactivates the key with Lemon Squeezy (release the seat,
   * no charges) and wipes the vault, locking the app until a valid key is entered.
   */
  const cancelTrial = async (): Promise<boolean> => {
    const licenseKey = await settingsStore.getSecret(KEY_LICENSE_KEY);
    const instanceId = await settingsStore.getSecret(KEY_INSTANCE_ID);

    // If key is tied to Lemon Squeezy, deactivate with API first
    if (licenseKey && instanceId) {
      await invoke('deactivate_license_api', {
        licenseKey,
        instanceId,
      });
      await settingsStore.saveSecret(KEY_LICENSE_KEY, '');
      await settingsStore.saveSecret(KEY_INSTANCE_ID, '');
    }

    // Mark as expired so the License Gate remains
    await settingsStore.saveSecret(KEY_EXPIRES_AT, '');
    await settingsStore.saveSecret(KEY_STATUS, 'expired');
    await settingsStore.saveSecret(KEY_LAST_VALIDATED, '');

    isLicensed.value = false;
    licenseStatus.value = build({
      status: 'expired',
      activated: false,
      valid: false,
      expiresAt: null,
      nowMs: Date.now(),
      customer_name: null,
      customer_email: null,
      license_key: null,
      instance_id: null,
    });
    return true;
  };

  return {
    isLicensed,
    licenseStatus,
    isChecking,
    isActivating,
    activationError,
    checkLicense,
    refreshLicense,
    startBackgroundRefresh,
    activateLicense,
    deactivateLicense,
    cancelTrial,
  };
});