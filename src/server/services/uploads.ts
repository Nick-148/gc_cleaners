/** Quote photo validation and storage (ADR 0003, 0006). */
import { uploadRules } from '../../config/site';
import { ApiError } from '../errors';

export type ImageType = (typeof uploadRules.acceptedTypes)[number];

const HEIF_BRANDS: Record<string, ImageType> = {
  heic: 'image/heic',
  heix: 'image/heic',
  hevc: 'image/heic',
  hevx: 'image/heic',
  heim: 'image/heic',
  heis: 'image/heic',
  mif1: 'image/heif',
  msf1: 'image/heif',
  heif: 'image/heif',
};

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** Identifies an image by its magic bytes. Never trust the file name or the client's MIME type. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 4) === 'PNG' &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    return HEIF_BRANDS[ascii(bytes, 8, 12)] ?? null;
  }
  return null;
}

/** File extension per stored content type; unknown types fall back to "bin" at the call site. */
export const EXTENSIONS: Readonly<Partial<Record<string, string>>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export interface ValidatedPhoto {
  bytes: Uint8Array;
  contentType: ImageType;
  sizeBytes: number;
}

/** Validates count, sizes and real file types. Throws a 400/413 ApiError with a clear message. */
export async function validatePhotos(files: readonly File[]): Promise<ValidatedPhoto[]> {
  if (files.length > uploadRules.maxFiles) {
    throw new ApiError(
      400,
      'too_many_photos',
      `You can attach up to ${uploadRules.maxFiles} photos.`,
      {
        photos: `Attach ${uploadRules.maxFiles} photos or fewer.`,
      },
    );
  }
  let total = 0;
  const photos: ValidatedPhoto[] = [];
  for (const file of files) {
    if (file.size === 0) continue;
    if (file.size > uploadRules.maxFileBytes) {
      throw new ApiError(413, 'photo_too_large', 'One of the photos is larger than 10 MB.', {
        photos: 'Each photo must be 10 MB or smaller.',
      });
    }
    total += file.size;
    if (total > uploadRules.maxTotalBytes) {
      throw new ApiError(413, 'photos_too_large', 'Photos must add up to 30 MB or less.', {
        photos: 'All photos together must be 30 MB or smaller.',
      });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = sniffImageType(bytes);
    if (!contentType) {
      throw new ApiError(
        400,
        'unsupported_photo_type',
        'Photos must be JPEG, PNG, WebP or HEIC images.',
        {
          photos: 'Use JPEG, PNG, WebP or HEIC photos.',
        },
      );
    }
    photos.push({ bytes, contentType, sizeBytes: bytes.byteLength });
  }
  return photos;
}

export function photoKey(quoteId: string, photoId: string): string {
  return `quotes/${quoteId}/${photoId}`;
}
