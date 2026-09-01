<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  source: any;
}>();

defineEmits<{
  (e: 'error', error: any): void;
  (e: 'loaded', doc: any): void;
}>();

// Resolve clean URL string whether source is passed as a string or an object { url: string, ... }
const pdfUrlString = computed(() => {
  if (!props.source) return '';
  if (typeof props.source === 'string') return props.source;
  if (props.source.url) return props.source.url;
  return '';
});

/* =========================================================================
 * [COMMENTED OUT: PDF.JS VIRTUALIZED INTERSECTION OBSERVER VIEWER]
 * Kept for reference if custom canvas-layer rendering is needed.
 * =========================================================================
 *
 * import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
 * import VuePdfEmbed, { usePdfDocument } from 'vue-pdf-embed';
 * import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, AlertCircle } from '@lucide/vue';
 *
 * const containerRef = ref<HTMLElement | null>(null);
 * const pageElements = ref<Map<number, HTMLElement>>(new Map());
 *
 * const { doc } = usePdfDocument({
 *   source: computed(() => props.source),
 *   onError: (err) => {
 *     errorMessage.value = err.message || err.toString();
 *     emit('error', err);
 *   }
 * });
 *
 * const numPages = ref(0);
 * const aspectRatio = ref(1.414);
 * const visiblePages = ref<Set<number>>(new Set([1]));
 * const currentPage = ref(1);
 * const zoomScale = ref(1.0);
 * const isLoading = ref(true);
 * const errorMessage = ref<string | null>(null);
 *
 * let observer: IntersectionObserver | null = null;
 *
 * const setupObserver = () => {
 *   if (observer) {
 *     observer.disconnect();
 *     observer = null;
 *   }
 *   if (!containerRef.value) return;
 *
 *   observer = new IntersectionObserver(
 *     (entries) => {
 *       const updated = new Set(visiblePages.value);
 *       let maxRatio = 0;
 *       let mostVisible = currentPage.value;
 *
 *       entries.forEach((entry) => {
 *         const pageNum = Number((entry.target as HTMLElement).dataset.pageNumber);
 *         if (!pageNum) return;
 *
 *         if (entry.isIntersecting) {
 *           updated.add(pageNum);
 *           if (pageNum > 1) updated.add(pageNum - 1);
 *           if (pageNum < numPages.value) updated.add(pageNum + 1);
 *
 *           if (entry.intersectionRatio > maxRatio) {
 *             maxRatio = entry.intersectionRatio;
 *             mostVisible = pageNum;
 *           }
 *         } else {
 *           const dist = Math.abs(pageNum - mostVisible);
 *           if (dist > 2) {
 *             updated.delete(pageNum);
 *           }
 *         }
 *       });
 *
 *       visiblePages.value = updated;
 *       if (maxRatio > 0.2) {
 *         currentPage.value = mostVisible;
 *       }
 *     },
 *     {
 *       root: containerRef.value,
 *       rootMargin: '350px 0px 350px 0px',
 *       threshold: [0, 0.2, 0.5, 0.8, 1.0]
 *     }
 *   );
 *
 *   pageElements.value.forEach((el) => {
 *     observer?.observe(el);
 *   });
 * };
 * ========================================================================= */
</script>

<template>
  <div class="native-pdf-container">
    <!-- Native Browser PDF Engine (Iframe / Native Plugin) -->
    <iframe
      v-if="pdfUrlString"
      :src="pdfUrlString"
      class="native-pdf-frame"
      type="application/pdf"
      title="PDF Preview"
    />
    <div v-else class="native-pdf-empty">
      <span>No PDF source available.</span>
    </div>
  </div>
</template>

<style scoped>
.native-pdf-container {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--surface, #161b22);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.native-pdf-frame {
  width: 100%;
  height: 100%;
  border: none;
  background: #ffffff;
  display: block;
  flex: 1;
}

.native-pdf-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted, #8b949e);
  font-size: 0.85rem;
}
</style>
