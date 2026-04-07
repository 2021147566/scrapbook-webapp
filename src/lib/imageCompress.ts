/**
 * 스크랩북용 이미지 압축 — 화면 표시 수준의 화질 유지, 용량만 줄임.
 * - 긴 변이 maxLongEdge 초과면 비율 유지 축소(기본 2048px)
 * - JPEG 재인코딩(기본 품질 0.88)
 * - PNG 등은 흰 배경 위에 그린 뒤 JPEG로 통일
 */

import type { PersistedSnapshot } from '../types';

const DEFAULT_MAX_LONG_EDGE = 2048;
const DEFAULT_JPEG_QUALITY = 0.88;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = dataUrl;
  });
}

export type CompressOptions = {
  /** 긴 변 상한(px). 이보다 작으면 해상도 유지 */
  maxLongEdge?: number;
  /** JPEG 품질 0~1 */
  quality?: number;
};

/**
 * data URL 한 장을 압축. 실패 시 원본 반환.
 */
export async function compressDataUrlForScrap(
  dataUrl: string,
  options?: CompressOptions,
): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  const maxLongEdge = options?.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;
  const quality = options?.quality ?? DEFAULT_JPEG_QUALITY;

  try {
    const img = await loadImage(dataUrl);
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (w <= 0 || h <= 0) {
      return dataUrl;
    }

    const scale = Math.min(maxLongEdge / w, maxLongEdge / h, 1);
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return dataUrl;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);

    const out = canvas.toDataURL('image/jpeg', quality);
    if (out.length >= dataUrl.length * 0.99 && dataUrl.includes('image/jpeg')) {
      return dataUrl;
    }
    return out;
  } catch {
    return dataUrl;
  }
}

/**
 * 스냅샷 안의 모든 이미지 dataUrl 압축(백업 가져오기 등).
 */
export async function compressSnapshotImages(
  snapshot: PersistedSnapshot,
  options?: CompressOptions,
): Promise<PersistedSnapshot> {
  const imagesByDate: PersistedSnapshot['imagesByDate'] = {};
  for (const [date, list] of Object.entries(snapshot.imagesByDate ?? {})) {
    imagesByDate[date] = await Promise.all(
      list.map(async (img) => {
        const dataUrl = await compressDataUrlForScrap(img.dataUrl, options);
        return {
          ...img,
          dataUrl,
          updatedAt: Date.now(),
        };
      }),
    );
  }
  return {
    ...snapshot,
    imagesByDate,
    updatedAt: Date.now(),
  };
}
