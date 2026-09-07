<script setup lang="ts">
import { ref } from 'vue';
import { useLicenseStore } from '../store/license';
import { openUrl } from '@tauri-apps/plugin-opener';
import { exit } from '@tauri-apps/plugin-process';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import {
  Key,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Lock,
  Loader2,
  Power,
  ClipboardPaste,
  ArrowRight,
  Copy,
  Check
} from '@lucide/vue';
import { copyToClipboard } from '../utils/clipboard';
import { Motion } from 'motion-v';

const emit = defineEmits<{
  (e: 'skip'): void;
}>();

const licenseStore = useLicenseStore();
const licenseKeyInput = ref('');
const isErrorCopied = ref(false);

const handleCopyActivationError = async () => {
  if (!licenseStore.activationError) return;
  const ok = await copyToClipboard(licenseStore.activationError);
  if (ok) {
    isErrorCopied.value = true;
    setTimeout(() => { isErrorCopied.value = false; }, 2000);
  }
};

// Central public repo / website redirect hub for downloads & license purchasing
const purchaseUrl = 'https://github.com/AhmedTrooper/roletect-app';

const handleSkip = async (e?: Event) => {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  licenseStore.isGateDismissed = true;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('license_gate_skipped', 'true');
    }
  } catch {}
  try {
    await licenseStore.dismissGate();
  } catch (err) {
    console.error('Failed to dismiss gate:', err);
  }
  emit('skip');
};

const handleActivate = async () => {
  if (!licenseKeyInput.value.trim()) return;
  await licenseStore.activateLicense(licenseKeyInput.value);
};

// Desktop apps don't always show a native context menu, so provide an explicit paste button.
const handlePasteKey = async () => {
  try {
    const text = await readText();
    if (text) licenseKeyInput.value = text;
  } catch (e) {
    console.error('Failed to read clipboard:', e);
  }
};

const handleBuyClick = () => {
  openUrl(purchaseUrl).catch((err: any) => console.error('Failed to open purchase URL:', err));
};

// Manage/cancel subscription directly with Lemon Squeezy. Shown here too so users who
// changed plans (or upgraded) but never entered a key can still reach their billing.
const handleCancelSubscriptionClick = () => {
  openUrl('https://app.lemonsqueezy.com/my-orders/').catch((err: any) =>
    console.error('Failed to open subscription page:', err)
  );
};

const handleExit = async () => {
  await exit(0);
};
</script>

<template>
  <div class="license-gate-overlay">
    <Motion
      :initial="{ opacity: 0, scale: 0.95, y: 15 }"
      :animate="{ opacity: 1, scale: 1, y: 0 }"
      :transition="{ duration: 0.25, ease: 'easeOut' }"
      class="license-gate-card"
    >
      <!-- Header / Icon -->
      <div class="card-header">
        <div class="icon-badge">
          <Lock class="badge-icon" :size="28" />
        </div>
        <h1 class="card-title">
          RoleTect License Required
        </h1>
        <p class="card-subtitle">
          Activate your copy of RoleTect with your Lemon Squeezy license key to unlock the complete workspace.
        </p>
      </div>

      <!-- Feature Banner -->
      <div class="trial-banner">
        <ShieldCheck class="banner-icon" :size="16" />
        <span>
          Offline-first AI resume tailoring, on-device LaTeX compilation, and document optimization.
        </span>
      </div>

      <!-- Most Visible Action: Skip & Continue with Free Version -->
      <div class="skip-action-container" @click="handleSkip">
        <button
          type="button"
          class="btn-skip-primary"
          @click.stop="handleSkip"
        >
          <div class="skip-btn-badge-row">
            <span class="skip-btn-badge">CONTINUE TO WORKSPACE</span>
            <span class="skip-btn-tag">100% FREE TIER</span>
          </div>
          <div class="skip-btn-main-row">
            <div class="skip-btn-info">
              <span class="skip-btn-title">Skip &amp; Use Free Version</span>
              <span class="skip-btn-desc">Full AI tailoring, LaTeX compiling &amp; vault access • Themes capped</span>
            </div>
            <div class="skip-btn-arrow-circle">
              <ArrowRight :size="18" />
            </div>
          </div>
        </button>
      </div>

      <div class="or-divider">
        <span>OR ACTIVATE PRO LICENSE</span>
      </div>

      <!-- Activation Form -->
      <form @submit.prevent="handleActivate" class="activation-form">
        <div class="input-group">
          <label for="license-key" class="input-label">
            <Key :size="14" />
            <span>License Key</span>
          </label>
          <div class="input-wrapper">
            <input
              id="license-key"
              v-model="licenseKeyInput"
              type="text"
              class="license-input"
              placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
              autocomplete="off"
              spellcheck="false"
              :disabled="licenseStore.isActivating"
            />
            <button
              type="button"
              class="paste-btn"
              title="Paste from clipboard"
              @click="handlePasteKey"
            >
              <ClipboardPaste :size="14" />
            </button>
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="licenseStore.activationError" class="error-box">
          <div class="error-box-main">
            <AlertCircle :size="16" class="error-icon" />
            <span>{{ licenseStore.activationError }}</span>
          </div>
          <button
            type="button"
            class="copy-err-inline-btn"
            @click="handleCopyActivationError"
            :title="isErrorCopied ? 'Copied!' : 'Copy Error'"
          >
            <Check v-if="isErrorCopied" :size="12" />
            <Copy v-else :size="12" />
            <span>{{ isErrorCopied ? 'Copied!' : 'Copy' }}</span>
          </button>
        </div>

        <!-- Action Buttons -->
        <div class="button-group">
          <button
            type="submit"
            class="btn-primary"
            :disabled="licenseStore.isActivating || !licenseKeyInput.trim()"
          >
            <Loader2 v-if="licenseStore.isActivating" class="spinner" :size="16" />
            <ShieldCheck v-else :size="16" />
            <span>{{ licenseStore.isActivating ? 'Verifying with Lemon Squeezy...' : 'Activate License' }}</span>
          </button>

          <button
            type="button"
            class="btn-secondary"
            @click="handleBuyClick"
          >
            <ExternalLink :size="14" />
            <span>Get a License</span>
          </button>
        </div>
      </form>

      <!-- Footer Info & Exit -->
      <div class="card-footer">
        <div class="security-note">
          <ShieldCheck :size="12" />
          <span>Encrypted Local Storage • 7-Day Offline Grace Period</span>
        </div>
        <button type="button" class="btn-exit" @click="handleCancelSubscriptionClick">
          <ExternalLink :size="12" />
          <span>Manage / Cancel Subscription</span>
        </button>
        <button type="button" class="btn-exit" @click="handleExit">
          <Power :size="13" />
          <span>Quit Application</span>
        </button>
      </div>
    </Motion>
  </div>
</template>

<style scoped>
.license-gate-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.license-gate-card {
  width: 100%;
  max-width: 480px;
  background: var(--surface, #1e1e2e);
  border: 1px solid var(--line, rgba(255, 255, 255, 0.1));
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 20px;
  color: var(--ink, #ffffff);
}

.card-header {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.icon-badge {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: var(--accent-soft, rgba(35, 134, 54, 0.15));
  border: 1px solid var(--accent, #238636);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent, #238636);
  margin-bottom: 4px;
}


.card-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--ink, #ffffff);
}

.card-subtitle {
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted, #8b949e);
  margin: 0;
  max-width: 380px;
}

.trial-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--surface-soft, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  font-size: 12px;
  color: var(--muted, #c9d1d9);
}


.banner-icon {
  color: var(--accent, #238636);
  shrink: 0;
}

.skip-action-container {
  margin: 2px 0 6px 0;
}

.btn-skip-primary {
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(35, 134, 54, 0.22) 0%, rgba(46, 160, 67, 0.38) 100%);
  border: 2px solid var(--accent, #238636);
  border-radius: 12px;
  color: var(--ink, #ffffff);
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(35, 134, 54, 0.3);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: left;
  box-sizing: border-box;
}

.btn-skip-primary:hover {
  background: linear-gradient(135deg, rgba(35, 134, 54, 0.32) 0%, rgba(46, 160, 67, 0.5) 100%);
  border-color: #2ea043;
  box-shadow: 0 6px 28px rgba(35, 134, 54, 0.45);
  transform: translateY(-2px);
}

.btn-skip-primary:active {
  transform: translateY(0);
}

.btn-skip-primary * {
  pointer-events: none;
}

.skip-btn-badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.skip-btn-badge {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: var(--accent, #238636);
  color: #ffffff;
  padding: 2px 7px;
  border-radius: 4px;
}

.skip-btn-tag {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #a7f3d0;
  background: rgba(16, 185, 129, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
}

.skip-btn-main-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.skip-btn-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.skip-btn-title {
  font-size: 15px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -0.01em;
}

.skip-btn-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.82);
  line-height: 1.35;
}

.skip-btn-arrow-circle {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--accent, #238636);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s ease;
}

.btn-skip-primary:hover .skip-btn-arrow-circle {
  transform: translateX(3px);
}

.or-divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 2px 0;
}

.or-divider::before,
.or-divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid var(--line, rgba(255, 255, 255, 0.1));
}

.or-divider span {
  padding: 0 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--muted, #8b949e);
  text-transform: uppercase;
}

.activation-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted, #8b949e);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.input-wrapper {
  position: relative;
}

.license-input {
  width: 100%;
  padding: 12px 40px 12px 14px;
  background: var(--bg, #0d1117);
  border: 1px solid var(--line, #30363d);
  border-radius: 8px;
  color: var(--ink, #ffffff);
  font-family: monospace;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}

.license-input:focus {
  border-color: var(--accent, #238636);
  box-shadow: 0 0 0 2px var(--accent-soft, rgba(35, 134, 54, 0.2));
}

.paste-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--muted, #8b949e);
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.paste-btn:hover {
  color: var(--accent, #238636);
  background: var(--accent-soft, rgba(35, 134, 54, 0.1));
}

.error-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  background: var(--surface-soft);
  border: 1px solid var(--warning);
  border-radius: 8px;
  font-size: 12px;
  color: var(--warning);
}

.error-box-main {
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: text !important;
  -webkit-user-select: text !important;
  text-align: left;
}

.error-icon {
  flex-shrink: 0;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--accent, #238636);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.1s ease;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  background: transparent;
  border: 1px solid var(--line, #30363d);
  color: var(--muted, #8b949e);
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.btn-secondary:hover {
  color: var(--ink, #ffffff);
  border-color: var(--muted, #8b949e);
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  border-top: 1px solid var(--line, #30363d);
  font-size: 11px;
  color: var(--muted, #8b949e);
}

.security-note {
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-exit {
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: var(--muted, #8b949e);
  font-size: 11px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.btn-exit:hover {
  color: var(--warning, #f85149);
  background: rgba(248, 81, 73, 0.08);
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
