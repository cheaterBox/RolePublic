import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from './settings';

export interface LicenseStatus {
  activated: boolean;
  valid: boolean;
  status: string; // "active" | "trial" | "expired" | "disabled" | "none"
  trial: boolean;
  trial_ends_at: string | null;
  customer_name: string | null;
  customer_email: string | null;
  license_key: string | null;
  instance_id?: string | null;
}

// Stronghold Keyring Secret Identifiers
const KEY_LICENSE_KEY = 'ls_license_key';
const KEY_INSTANCE_ID = 'ls_instance_id';
const KEY_LAST_VALIDATED = 'ls_last_validated_at';
const KEY_TRIAL_STARTED_AT = 'ls_trial_started_at';
const KEY_TRIAL_ENDS_AT = 'ls_trial_ends_at';
const KEY_STATUS = 'ls_license_status';
const KEY_CUSTOMER_EMAIL = 'ls_customer_email';
const KEY_CUSTOMER_NAME = 'ls_customer_name';
const KEY_IS_TRIAL = 'ls_is_trial';

// Trial Duration: 7 Full Days in milliseconds
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
// 7-day re-validation window for online licenses with a 3-day extra network grace
const REVALIDATE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const OFFLINE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export const useLicenseStore = defineStore('license', () => {
  const isLicensed = ref(false);
  const licenseStatus = ref<LicenseStatus | null>(null);
  const isChecking = ref(true);
  const isActivating = ref(false);
  const activationError = ref<string | null>(null);
  const isTrialExpired = ref(false);

  const settingsStore = useSettingsStore();

  /**
   * Check encrypted license credentials in OS Stronghold vault.
   * - If paid license exists: validates against Stronghold / Lemon Squeezy.
   * - If no paid license: initializes or checks the built-in 7-Day Free Trial.
   */
  const checkLicense = async (): Promise<boolean> => {
    isChecking.value = true;
    activationError.value = null;
    isTrialExpired.value = false;

    try {
      // 1. Read encrypted credentials from Stronghold Keyring
      const licenseKey = await settingsStore.getSecret(KEY_LICENSE_KEY);
      const instanceId = await settingsStore.getSecret(KEY_INSTANCE_ID);
      const lastValidatedStr = await settingsStore.getSecret(KEY_LAST_VALIDATED);
      const trialEndsAt = await settingsStore.getSecret(KEY_TRIAL_ENDS_AT);
      const status = (await settingsStore.getSecret(KEY_STATUS)) || 'active';
      const customerEmail = await settingsStore.getSecret(KEY_CUSTOMER_EMAIL);
      const customerName = await settingsStore.getSecret(KEY_CUSTOMER_NAME);
      const isTrial = (await settingsStore.getSecret(KEY_IS_TRIAL)) === 'true';

      const now = Date.now();

      // CASE A: User has an activated Lemon Squeezy license key
      if (licenseKey && instanceId) {
        const lastValidated = lastValidatedStr ? parseInt(lastValidatedStr, 10) : 0;
        const elapsed = now - lastValidated;

        // If user was on trial and trial date has arrived, force an online sync to detect Pro conversion
        const isTrialDueForSync = isTrial && trialEndsAt && (now >= new Date(trialEndsAt).getTime());

        // Within 7-day re-validation window & trial has not just ended -> Unlock immediately with cache
        if (!isTrialDueForSync && lastValidated > 0 && elapsed <= REVALIDATE_INTERVAL_MS) {
          licenseStatus.value = {
            activated: true,
            valid: true,
            status,
            trial: isTrial,
            trial_ends_at: trialEndsAt || null,
            customer_name: customerName || null,
            customer_email: customerEmail || null,
            license_key: licenseKey,
            instance_id: instanceId,
          };
          const unlocked = status === 'active' || isTrial;
          isLicensed.value = unlocked;
          return unlocked;
        }

        // Re-validate with Lemon Squeezy API to detect Pro upgrade or renew status
        try {
          const result = await invoke<LicenseStatus>('validate_license_api', {
            licenseKey,
            instanceId,
          });

          if (result && result.valid) {
            await settingsStore.saveSecret(KEY_LAST_VALIDATED, now.toString());
            await settingsStore.saveSecret(KEY_STATUS, result.status);
            if (result.trial_ends_at) {
              await settingsStore.saveSecret(KEY_TRIAL_ENDS_AT, result.trial_ends_at);
            }
            await settingsStore.saveSecret(KEY_IS_TRIAL, result.trial ? 'true' : 'false');

            licenseStatus.value = {
              ...result,
              license_key: licenseKey,
              instance_id: instanceId,
            };
            const unlocked = result.status === 'active' || result.trial;
            isLicensed.value = unlocked;
            return unlocked;
          } else {
            isLicensed.value = false;
            licenseStatus.value = result;
            return false;
          }
        } catch (networkErr) {
          console.warn('Online license check failed, evaluating offline grace:', networkErr);
          if (elapsed <= REVALIDATE_INTERVAL_MS + OFFLINE_GRACE_MS) {
            licenseStatus.value = {
              activated: true,
              valid: true,
              status,
              trial: isTrial,
              trial_ends_at: trialEndsAt || null,
              customer_name: customerName || null,
              customer_email: customerEmail || null,
              license_key: licenseKey,
              instance_id: instanceId,
            };
            const unlocked = status === 'active' || isTrial;
            isLicensed.value = unlocked;
            return unlocked;
          } else {
            isLicensed.value = false;
            return false;
          }
        }
      }

      // CASE B: No Lemon Squeezy license key -> Use Built-in 7-Day Free Trial
      const trialStartedStr = await settingsStore.getSecret(KEY_TRIAL_STARTED_AT);

      if (!trialStartedStr) {
        // First-ever launch! Automatically start the 7-day free trial
        const trialEndDate = new Date(now + TRIAL_DURATION_MS).toISOString();
        await settingsStore.saveSecret(KEY_TRIAL_STARTED_AT, now.toString());
        await settingsStore.saveSecret(KEY_TRIAL_ENDS_AT, trialEndDate);
        await settingsStore.saveSecret(KEY_STATUS, 'trial');
        await settingsStore.saveSecret(KEY_IS_TRIAL, 'true');

        licenseStatus.value = {
          activated: true,
          valid: true,
          status: 'trial',
          trial: true,
          trial_ends_at: trialEndDate,
          customer_name: 'Trial User',
          customer_email: null,
          license_key: null,
          instance_id: null,
        };
        isLicensed.value = true;
        return true;
      }

      // Check if existing 7-day trial is still active
      const trialStarted = parseInt(trialStartedStr, 10);
      const trialEnds = trialEndsAt ? new Date(trialEndsAt).getTime() : trialStarted + TRIAL_DURATION_MS;

      if (now < trialEnds) {
        // Trial is still active!
        licenseStatus.value = {
          activated: true,
          valid: true,
          status: 'trial',
          trial: true,
          trial_ends_at: new Date(trialEnds).toISOString(),
          customer_name: 'Trial User',
          customer_email: null,
          license_key: null,
          instance_id: null,
        };
        isLicensed.value = true;
        return true;
      } else {
        // Trial has expired
        isTrialExpired.value = true;
        isLicensed.value = false;
        licenseStatus.value = {
          activated: false,
          valid: false,
          status: 'expired',
          trial: true,
          trial_ends_at: new Date(trialEnds).toISOString(),
          customer_name: null,
          customer_email: null,
          license_key: null,
          instance_id: null,
        };
        return false;
      }
    } catch (err: any) {
      console.error('Failed to check license status in Stronghold:', err);
      isLicensed.value = false;
      return false;
    } finally {
      isChecking.value = false;
    }
  };

  /**
   * Activate a license key with Lemon Squeezy and securely encrypt it in Stronghold.
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
        await settingsStore.saveSecret(KEY_IS_TRIAL, status.trial ? 'true' : 'false');
        if (status.trial_ends_at) {
          await settingsStore.saveSecret(KEY_TRIAL_ENDS_AT, status.trial_ends_at);
        }
        if (status.customer_email) {
          await settingsStore.saveSecret(KEY_CUSTOMER_EMAIL, status.customer_email);
        }
        if (status.customer_name) {
          await settingsStore.saveSecret(KEY_CUSTOMER_NAME, status.customer_name);
        }

        licenseStatus.value = status;
        const unlocked = status.valid && (status.status === 'active' || status.trial);
        isLicensed.value = unlocked;
        isTrialExpired.value = false;
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
    await settingsStore.saveSecret(KEY_LICENSE_KEY, '');
    await settingsStore.saveSecret(KEY_INSTANCE_ID, '');
    await settingsStore.saveSecret(KEY_LAST_VALIDATED, '');
    await settingsStore.saveSecret(KEY_STATUS, '');
    await settingsStore.saveSecret(KEY_CUSTOMER_EMAIL, '');
    await settingsStore.saveSecret(KEY_CUSTOMER_NAME, '');
    await settingsStore.saveSecret(KEY_IS_TRIAL, '');

    licenseStatus.value = null;
    isLicensed.value = false;
    return true;
  };

  /**
   * Force an immediate online synchronization with Lemon Squeezy to detect renewals or Pro conversions.
   */
  const refreshLicense = async (): Promise<boolean> => {
    isChecking.value = true;
    try {
      const licenseKey = await settingsStore.getSecret(KEY_LICENSE_KEY);
      const instanceId = await settingsStore.getSecret(KEY_INSTANCE_ID);

      if (!licenseKey || !instanceId) {
        return await checkLicense();
      }

      const result = await invoke<LicenseStatus>('validate_license_api', {
        licenseKey,
        instanceId,
      });

      if (result && result.valid) {
        const now = Date.now().toString();
        await settingsStore.saveSecret(KEY_LAST_VALIDATED, now);
        await settingsStore.saveSecret(KEY_STATUS, result.status);
        if (result.trial_ends_at) {
          await settingsStore.saveSecret(KEY_TRIAL_ENDS_AT, result.trial_ends_at);
        }
        await settingsStore.saveSecret(KEY_IS_TRIAL, result.trial ? 'true' : 'false');
        if (result.customer_email) {
          await settingsStore.saveSecret(KEY_CUSTOMER_EMAIL, result.customer_email);
        }
        if (result.customer_name) {
          await settingsStore.saveSecret(KEY_CUSTOMER_NAME, result.customer_name);
        }

        licenseStatus.value = {
          ...result,
          license_key: licenseKey,
          instance_id: instanceId,
        };
        const unlocked = result.status === 'active' || result.trial;
        isLicensed.value = unlocked;
        isTrialExpired.value = false;
        return unlocked;
      }
      return false;
    } catch (e) {
      console.warn('Failed to refresh license status:', e);
      return isLicensed.value;
    } finally {
      isChecking.value = false;
    }
  };

  /**
   * Cancel/End trial early and return to License Gate.
   */
  /**
   * Cancel/End trial early and return to License Gate.
   * If a Lemon Squeezy license key was active, deactivates the key with Lemon Squeezy first.
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

    const expiredDate = new Date(0).toISOString();
    await settingsStore.saveSecret(KEY_TRIAL_ENDS_AT, expiredDate);
    await settingsStore.saveSecret(KEY_STATUS, 'expired');
    await settingsStore.saveSecret(KEY_IS_TRIAL, 'false');

    isTrialExpired.value = true;
    isLicensed.value = false;
    licenseStatus.value = {
      activated: false,
      valid: false,
      status: 'expired',
      trial: true,
      trial_ends_at: expiredDate,
      customer_name: null,
      customer_email: null,
      license_key: null,
      instance_id: null,
    };
    return true;
  };

  return {
    isLicensed,
    licenseStatus,
    isChecking,
    isActivating,
    activationError,
    isTrialExpired,
    checkLicense,
    refreshLicense,
    activateLicense,
    deactivateLicense,
    cancelTrial,
  };
});
