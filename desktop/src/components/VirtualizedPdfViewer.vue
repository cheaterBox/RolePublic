<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue';
import VuePdfEmbed, { usePdfDocument } from 'vue-pdf-embed';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, AlertCircle } from '@lucide/vue';

const props = defineProps<{
  source: any;
}>();

const emit = defineEmits<{
  (e: 'error', error: any): void;
  (e: 'loaded', doc: any): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const pageElements = ref<Map<number, HTMLElement>>(new Map());

const { doc } = usePdfDocument({
  source: computed(() => props.source),
  onError: (err) => {
    errorMessage.value = err.message || err.toString();
    emit('error', err);
  }
});

const numPages = ref(0);
const aspectRatio = ref(1.414); // Default standard A4 (297 / 210)
const visiblePages = ref<Set<number>>(new Set([1]));
const currentPage = ref(1);
const zoomScale = ref(1.0);
const isLoading = ref(true);
const errorMessage = ref<string | null>(null);

let observer: IntersectionObserver | null = null;

// Initialize observer
const setupObserver = () => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  if (!containerRef.value) return;

  // Pre-load 350px above and below viewport so scrolling feels instant and never flashes
  observer = new IntersectionObserver(
    (entries) => {
      const updated = new Set(visiblePages.value);
      let maxRatio = 0;
      let mostVisible = currentPage.value;

      entries.forEach((entry) => {
        const pageNum = Number((entry.target as HTMLElement).dataset.pageNumber);
        if (!pageNum) return;

        if (entry.isIntersecting) {
          updated.add(pageNum);
          // Also pre-mount adjacent neighboring pages for butter-smooth scrolling
          if (pageNum > 1) updated.add(pageNum - 1);
          if (pageNum < numPages.value) updated.add(pageNum + 1);

          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            mostVisible = pageNum;
          }
        } else {
          // If out of viewport bounds, remove unless it's an immediate neighbor of most visible
          const dist = Math.abs(pageNum - mostVisible);
          if (dist > 2) {
            updated.delete(pageNum);
          }
        }
      });

      visiblePages.value = updated;
      if (maxRatio > 0.2) {
        currentPage.value = mostVisible;
      }
    },
    {
      root: containerRef.value,
      rootMargin: '350px 0px 350px 0px',
      threshold: [0, 0.2, 0.5, 0.8, 1.0]
    }
  );

  pageElements.value.forEach((el) => {
    observer?.observe(el);
  });
};

const registerPageEl = (pageNum: number, el: any) => {
  if (el) {
    pageElements.value.set(pageNum, el as HTMLElement);
    observer?.observe(el as HTMLElement);
  } else {
    const existing = pageElements.value.get(pageNum);
    if (existing && observer) {
      observer.unobserve(existing);
    }
    pageElements.value.delete(pageNum);
  }
};

// When PDF Document is loaded by PDF.js worker
watch(doc, async (newDoc) => {
  if (!newDoc) {
    numPages.value = 0;
    isLoading.value = true;
    return;
  }

  try {
    isLoading.value = true;
    errorMessage.value = null;
    numPages.value = newDoc.numPages;

    // Fetch page 1 dimensions to calculate exact aspect ratio
    const firstPage = await newDoc.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    if (viewport.width > 0 && viewport.height > 0) {
      aspectRatio.value = viewport.height / viewport.width;
    }

    // Set initial visible window
    visiblePages.value = new Set([1, 2, 3].filter((p) => p <= newDoc.numPages));
    currentPage.value = 1;

    emit('loaded', newDoc);

    await nextTick();
    setupObserver();
  } catch (err: any) {
    console.error('Error parsing PDF page dimensions:', err);
    errorMessage.value = err.message || err.toString();
    emit('error', err);
  } finally {
    isLoading.value = false;
  }
}, { immediate: true });

onMounted(() => {
  setupObserver();
});

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  pageElements.value.clear();
});

// Navigation & Zoom controls
const scrollToPage = (targetPage: number) => {
  const clamped = Math.max(1, Math.min(numPages.value, targetPage));
  const targetEl = pageElements.value.get(clamped);
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    currentPage.value = clamped;
  }
};

const nextPage = () => scrollToPage(currentPage.value + 1);
const prevPage = () => scrollToPage(currentPage.value - 1);

const zoomIn = () => {
  zoomScale.value = Math.min(2.5, +(zoomScale.value + 0.15).toFixed(2));
};

const zoomOut = () => {
  zoomScale.value = Math.max(0.5, +(zoomScale.value - 0.15).toFixed(2));
};

const resetZoom = () => {
  zoomScale.value = 1.0;
};
</script>

<template>
  <div class="virtual-pdf-container">
    <!-- Mini PDF Control Toolbar -->
    <div v-if="numPages > 0" class="pdf-toolbar">
      <div class="toolbar-section">
        <button class="tool-btn" :disabled="currentPage <= 1" @click="prevPage" title="Previous Page">
          <ChevronLeft :size="14" />
        </button>
        <span class="page-counter">
          Page <strong>{{ currentPage }}</strong> / {{ numPages }}
        </span>
        <button class="tool-btn" :disabled="currentPage >= numPages" @click="nextPage" title="Next Page">
          <ChevronRight :size="14" />
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-section">
        <button class="tool-btn" :disabled="zoomScale <= 0.5" @click="zoomOut" title="Zoom Out">
          <ZoomOut :size="13" />
        </button>
        <span class="zoom-level" @click="resetZoom" title="Click to Reset Zoom">
          {{ Math.round(zoomScale * 100) }}%
        </span>
        <button class="tool-btn" :disabled="zoomScale >= 2.5" @click="zoomIn" title="Zoom In">
          <ZoomIn :size="13" />
        </button>
      </div>
    </div>

    <!-- Scrollable Virtualized Canvas Viewport -->
    <div class="virtual-scroll-viewport" ref="containerRef">
      <div v-if="errorMessage" class="viewer-error">
        <AlertCircle :size="32" class="error-icon" />
        <p class="error-title">Failed to load preview</p>
        <p class="error-detail">{{ errorMessage }}</p>
      </div>

      <div v-else-if="numPages === 0 && isLoading" class="viewer-loading">
        <RotateCw :size="24" class="spinner" />
        <span>Loading document...</span>
      </div>

      <div
        v-else
        class="pages-list"
        :style="{ transform: `scale(${zoomScale})`, transformOrigin: 'top center' }"
      >
        <div
          v-for="pageNumber in numPages"
          :key="pageNumber"
          :ref="(el) => registerPageEl(pageNumber, el)"
          :data-page-number="pageNumber"
          class="page-wrapper"
          :style="{ aspectRatio: `${1 / aspectRatio}` }"
        >
          <!-- Mounted Canvas: ONLY for active pages in/near the viewport (RAM: ~14MB per active page) -->
          <VuePdfEmbed
            v-if="visiblePages.has(pageNumber) && doc"
            :source="doc"
            :page="pageNumber"
            class="active-pdf-page"
          />

          <!-- Lightweight Off-Screen Placeholder: Preserves exact height & scrollbar physics (RAM: ~0MB) -->
          <div v-else class="page-placeholder">
            <div class="page-watermark">
              <span>Page {{ pageNumber }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.virtual-pdf-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--bg-accent, #0b0f14);
  position: relative;
  overflow: hidden;
}

.pdf-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 6px 14px;
  background: var(--surface, #161b22);
  border-bottom: 1px solid var(--line, #30363d);
  font-size: 0.75rem;
  color: var(--ink, #c9d1d9);
  z-index: 10;
  user-select: none;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar-divider {
  width: 1px;
  height: 16px;
  background: var(--line, #30363d);
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted, #8b949e);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-btn:hover:not(:disabled) {
  background: var(--surface-soft, #21262d);
  color: var(--ink, #ffffff);
  border-color: var(--line, #30363d);
}

.tool-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.page-counter {
  font-size: 0.72rem;
  color: var(--muted, #8b949e);
  min-width: 80px;
  text-align: center;
}

.page-counter strong {
  color: var(--ink, #f0f6fc);
}

.zoom-level {
  font-size: 0.72rem;
  color: var(--muted, #8b949e);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}

.zoom-level:hover {
  background: var(--surface-soft, #21262d);
  color: var(--ink, #ffffff);
}

.virtual-scroll-viewport {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  scroll-behavior: smooth;
}

.pages-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  width: 100%;
  max-width: 800px;
  transition: transform 0.15s ease-out;
}

.page-wrapper {
  width: 100%;
  background: #ffffff;
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.active-pdf-page {
  width: 100%;
  height: 100%;
  display: block;
}

.active-pdf-page :deep(canvas) {
  width: 100% !important;
  height: auto !important;
  display: block;
}

.page-placeholder {
  width: 100%;
  height: 100%;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-watermark {
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #6e7681;
}

.viewer-loading, .viewer-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--muted, #8b949e);
  text-align: center;
  height: 100%;
}

.viewer-error {
  color: var(--warning, #f85149);
}

.error-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--ink, #f0f6fc);
  margin: 0;
}

.error-detail {
  font-size: 0.75rem;
  color: var(--muted, #8b949e);
  max-width: 400px;
  word-break: break-word;
  margin: 0;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
