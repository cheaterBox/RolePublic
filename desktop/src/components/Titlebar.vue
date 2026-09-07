<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ref, onMounted, onUnmounted, computed } from "vue";
import {
  ShieldCheck,
  Sparkles,
  User,
  ChevronDown,
  Minus,
  Square,
  Maximize2,
  X,
  Settings,
  RefreshCw,
  AlertTriangle
} from '@lucide/vue';
import { useLicenseStore } from "../store/license";
import { useErrorAuditStore } from "../store/error_audit";
import { useRouter } from "vue-router";
import { Motion, AnimatePresence } from "motion-v";

const appWindow = getCurrentWindow();
const isMaximized = ref(false);
const licenseStore = useLicenseStore();
const errorAuditStore = useErrorAuditStore();
const router = useRouter();

const showProfileMenu = ref(false);
const profileWrapperRef = ref<HTMLElement | null>(null);
const isSyncingLicense = ref(false);

const toggleProfileMenu = (e: MouseEvent) => {
  e.stopPropagation();
  showProfileMenu.value = !showProfileMenu.value;
};

const handleClickOutside = (e: MouseEvent) => {
  if (profileWrapperRef.value && !profileWrapperRef.value.contains(e.target as Node)) {
    showProfileMenu.value = false;
  }
};

const handleSyncLicense = async () => {
  isSyncingLicense.value = true;
  try {
    await licenseStore.refreshLicense();
  } finally {
    isSyncingLicense.value = false;
  }
};

const goToSettings = () => {
  showProfileMenu.value = false;
  router.push('/settings');
};

const goToActivation = () => {
  router.push({ path: '/settings', hash: '#license-activation' }).then(() => {
    setTimeout(() => {
      const el = document.getElementById('license-activation');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = document.getElementById('upgrade-key-input') as HTMLInputElement | null;
        if (input) {
          setTimeout(() => {
            input.focus();
            input.classList.add('pulse-focus');
            setTimeout(() => input.classList.remove('pulse-focus'), 1600);
          }, 300);
        }
      }
    }, 100);
  });
};

const trialDaysRemaining = computed(() => {
  if (!licenseStore.licenseStatus?.trial_ends_at) return null;
  const end = new Date(licenseStore.licenseStatus.trial_ends_at).getTime();
  const now = Date.now();
  const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
});

const userDisplayName = computed(() => {
  if (licenseStore.licenseStatus?.customer_name) {
    return licenseStore.licenseStatus.customer_name;
  }
  if (licenseStore.licenseStatus?.customer_email) {
    return licenseStore.licenseStatus.customer_email.split('@')[0];
  }
  return 'Pro Member';
});

const minimize = () => appWindow.minimize();
const toggleMaximize = async () => {
  await appWindow.toggleMaximize();
  isMaximized.value = await appWindow.isMaximized();
};
const close = () => appWindow.close();

onMounted(async () => {
  isMaximized.value = await appWindow.isMaximized();
  appWindow.onResized(async () => {
    isMaximized.value = await appWindow.isMaximized();
  });
  document.addEventListener('click', handleClickOutside);
  errorAuditStore.loadStats();
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="titlebar">
    <!-- Left Logo & Branding -->
    <div class="titlebar-left" data-tauri-drag-region>
      <div class="logo-dot" data-tauri-drag-region></div>
      <span class="app-title" data-tauri-drag-region>Roletect</span>
    </div>
    
    <!-- Center Draggable Area -->
    <div class="titlebar-center" data-tauri-drag-region></div>

    <!-- Right Section: Profile Badge & Window Controls -->
    <div class="titlebar-right" data-tauri-drag-region="false">
      <!-- License Profile Badge (Only shown when licensed) -->
      <div 
        v-if="licenseStore.isLicensed" 
        ref="profileWrapperRef"
        class="profile-wrapper"
      >
        <button 
          type="button"
          class="license-badge-btn" 
          @click="toggleProfileMenu"
          :title="licenseStore.licenseStatus?.customer_email || 'License Information'"
        >
          <Sparkles v-if="licenseStore.licenseStatus?.trial" :size="12" class="badge-icon trial" />
          <ShieldCheck v-else :size="12" class="badge-icon active" />
          
          <span class="badge-label desktop-only">
            {{ licenseStore.licenseStatus?.trial ? `Trial (${trialDaysRemaining}d)` : userDisplayName }}
          </span>
          <ChevronDown :size="10" class="badge-chevron desktop-only" />
        </button>

        <!-- Profile Popover Dropdown -->
        <AnimatePresence>
          <Motion
            v-if="showProfileMenu"
            :initial="{ opacity: 0, y: -4, scale: 0.95 }"
            :animate="{ opacity: 1, y: 0, scale: 1 }"
            :exit="{ opacity: 0, y: -4, scale: 0.95 }"
            :transition="{ duration: 0.12, ease: 'easeOut' }"
            class="profile-dropdown"
          >
            <div class="dropdown-header">
              <div class="user-avatar">
                <User :size="14" />
              </div>
              <div class="user-meta">
                <span class="user-name">{{ userDisplayName }}</span>
                <span v-if="licenseStore.licenseStatus?.customer_email" class="user-email">
                  {{ licenseStore.licenseStatus.customer_email }}
                </span>
              </div>
            </div>

            <div class="dropdown-divider"></div>

            <div class="dropdown-status-row">
              <span class="status-label">Plan</span>
              <span class="status-pill" :class="{ 'is-trial': licenseStore.licenseStatus?.trial }">
                {{ licenseStore.licenseStatus?.trial ? `Trial (${trialDaysRemaining} days remaining)` : 'Lifetime / Subscription' }}
              </span>
            </div>

            <div class="dropdown-divider"></div>

            <button type="button" class="dropdown-item" @click="handleSyncLicense" :disabled="isSyncingLicense">
              <RefreshCw :size="13" :class="{ 'spinner': isSyncingLicense }" />
              <span>{{ isSyncingLicense ? 'Syncing Status...' : 'Sync License Status' }}</span>
            </button>

            <button type="button" class="dropdown-item" @click="goToSettings">
              <Settings :size="13" />
              <span>Manage License in Settings</span>
            </button>
          </Motion>
        </AnimatePresence>
      </div>

      <!-- Free Tier Badge / Upgrade Button -->
      <button 
        v-else 
        type="button" 
        class="license-badge-btn free" 
        @click="goToActivation" 
        title="Running Free Tier — Click to Activate Pro"
      >
        <Sparkles :size="12" class="badge-icon free" />
        <span class="badge-label desktop-only">Free Tier</span>
      </button>

      <!-- Error Audit Logs Button -->
      <button 
        type="button" 
        class="titlebar-button error-audit-titlebar-btn" 
        @click="errorAuditStore.openViewer()" 
        :title="errorAuditStore.stats.total > 0 ? `${errorAuditStore.stats.total} error task(s) logged in audit trail` : 'System Error Audit Trail'"
      >
        <AlertTriangle :size="13" :class="{ 'has-errors': errorAuditStore.stats.total > 0 }" />
        <span v-if="errorAuditStore.stats.total > 0" class="audit-counter-badge">
          {{ errorAuditStore.stats.total > 99 ? '99+' : errorAuditStore.stats.total }}
        </span>
      </button>

      <!-- Window Control Buttons -->
      <button type="button" class="titlebar-button" @click="minimize" title="Minimize">
        <Minus :size="14" />
      </button>
      <button type="button" class="titlebar-button" @click="toggleMaximize" :title="isMaximized ? 'Restore' : 'Maximize'">
        <component :is="isMaximized ? Square : Maximize2" :size="isMaximized ? 10 : 12" />
      </button>
      <button type="button" class="titlebar-button close-button" @click="close" title="Close">
        <X :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.titlebar {
  height: 36px;
  background: var(--bg-accent);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--line);
  user-select: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10000;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.titlebar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 14px;
  height: 100%;
}

.logo-dot {
  width: 6px;
  height: 6px;
  background: var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--accent);
}

.app-title {
  font-size: 0.65rem;
  font-weight: 800;
  color: var(--muted);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.titlebar-center {
  flex: 1;
  height: 100%;
}

.titlebar-right {
  display: flex;
  align-items: center;
  height: 100%;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

/* License Profile Badge */
.profile-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  margin-right: 8px;
}

.license-badge-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  background: var(--surface-soft, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--line, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  color: var(--ink);
  font-size: 11px;
  cursor: pointer;
  -webkit-app-region: no-drag;
  app-region: no-drag;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.license-badge-btn:hover {
  background: var(--surface, rgba(255, 255, 255, 0.1));
  border-color: var(--accent);
}

.badge-icon.active {
  color: var(--accent);
}

.badge-icon.trial {
  color: var(--warning);
}

.license-badge-btn.free {
  border-color: var(--line);
  margin-right: 8px;
}

.license-badge-btn.free:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.badge-icon.free {
  color: var(--muted);
}

.license-badge-btn.free:hover .badge-icon.free {
  color: var(--accent);
}


.badge-label {
  font-weight: 500;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge-chevron {
  color: var(--muted);
  opacity: 0.7;
}

/* Profile Dropdown Popover */
.profile-dropdown {
  position: absolute;
  top: 32px;
  right: 0;
  width: 240px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px;
  box-shadow: var(--shadow);
  z-index: 10001;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dropdown-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.user-meta {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.user-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-divider {
  height: 1px;
  background: var(--line);
  margin: 2px 0;
}

.dropdown-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px;
}

.status-label {
  font-size: 10px;
  color: var(--muted);
}

.status-pill {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-pill.is-trial {
  background: var(--surface-soft);
  color: var(--warning);
  border: 1px solid var(--warning);
}


.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--ink);
  font-size: 11px;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: background-color 0.12s ease;
}

.dropdown-item:hover {
  background: var(--surface-soft);
  color: var(--accent);
}

/* Window Buttons */
.titlebar-button {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  -webkit-app-region: no-drag;
  app-region: no-drag;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 0;
}

.titlebar-button:hover {
  background: var(--surface-soft);
  color: var(--ink);
}

.error-audit-titlebar-btn {
  position: relative;
  width: 38px;
  cursor: pointer;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.error-audit-titlebar-btn .has-errors {
  color: var(--warning);
}

.audit-counter-badge {
  position: absolute;
  top: 5px;
  right: 4px;
  background: var(--warning);
  color: var(--bg);
  font-size: 0.62rem;
  font-weight: 800;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 8px;
  min-width: 14px;
  text-align: center;
}

.close-button:hover {
  background: var(--warning) !important;
  color: var(--ink) !important;
}

.titlebar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
}

/* Responsive Styles */
@media (max-width: 600px) {
  .desktop-only {
    display: none !important;
  }
  
  .profile-wrapper {
    margin-right: 4px;
  }

  .license-badge-btn {
    padding: 3px 6px;
  }
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
