<script setup lang="ts">
import { ref } from 'vue';
import { useLicenseStore } from '../store/license';
import { openUrl } from '@tauri-apps/plugin-opener';
import { exit } from '@tauri-apps/plugin-process';
import { 
  Key, 
  ShieldCheck, 
  AlertCircle, 
  ExternalLink, 
  Lock, 
  Loader2, 
  Sparkles,
  Power
} from '@lucide/vue';
import { Motion } from 'motion-v';

const licenseStore = useLicenseStore();
const licenseKeyInput = ref('');

// Central public repo / website redirect hub for downloads & license purchasing
const purchaseUrl = 'https://github.com/AhmedTrooper/roletect-app';

const handleActivate = async () => {
  if (!licenseKeyInput.value.trim()) return;
  await licenseStore.activateLicense(licenseKeyInput.value);
};

const handleBuyClick = () => {
  openUrl(purchaseUrl).catch((err: any) => console.error('Failed to open purchase URL:', err));
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
        <div class="icon-badge" :class="{ 'expired': licenseStore.isTrialExpired }">
          <Lock class="badge-icon" :size="28" />
        </div>
        <h1 class="card-title">
          {{ licenseStore.isTrialExpired ? '7-Day Free Trial Ended' : 'RoleTect License Required' }}
        </h1>
        <p class="card-subtitle">
          {{ licenseStore.isTrialExpired 
            ? 'Your 7-day full access trial has concluded. Enter your Lemon Squeezy license key to continue using RoleTect Pro.' 
            : 'Activate your copy of RoleTect with your Lemon Squeezy license key to unlock the complete workspace.' 
          }}
        </p>
      </div>

      <!-- Trial / Promotion Banner -->
      <div class="trial-banner" :class="{ 'warning-banner': licenseStore.isTrialExpired }">
        <Sparkles v-if="!licenseStore.isTrialExpired" class="banner-icon" :size="16" />
        <AlertCircle v-else class="banner-icon warning" :size="16" />
        <span>
          {{ licenseStore.isTrialExpired 
            ? 'All your local LaTeX templates, jobs, and documents are saved safely on your machine.' 
            : 'Enjoy offline-first AI resume tailoring, on-device LaTeX compilation, and document optimization.' 
          }}
        </span>
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
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="licenseStore.activationError" class="error-box">
          <AlertCircle :size="16" class="error-icon" />
          <span>{{ licenseStore.activationError }}</span>
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

.icon-badge.expired {
  background: rgba(248, 81, 73, 0.15);
  border-color: var(--warning, #f85149);
  color: var(--warning, #f85149);
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

.trial-banner.warning-banner {
  background: rgba(248, 81, 73, 0.08);
  border-color: rgba(248, 81, 73, 0.25);
  color: var(--ink, #ffffff);
}

.banner-icon {
  color: var(--accent, #238636);
  shrink: 0;
}

.banner-icon.warning {
  color: var(--warning, #f85149);
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
  padding: 12px 14px;
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

.error-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(248, 81, 73, 0.1);
  border: 1px solid rgba(248, 81, 73, 0.3);
  border-radius: 8px;
  font-size: 12px;
  color: var(--warning, #f85149);
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
