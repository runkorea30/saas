/**
 * 로젠 업로드 엑셀을 저장할 로컬 폴더 handle 관리.
 *
 * 브라우저:
 * - Chromium 계열: File System Access API + IndexedDB 로 재사용 가능한
 *   FileSystemDirectoryHandle 저장. 최초 1회 폴더 선택 후 자동 저장.
 * - 그 외(Firefox/Safari): showDirectoryPicker 미지원 → 일반 다운로드 폴백 사용
 *   (`isFolderPickerSupported()` 로 감지, UI 는 안내 후 <a download> 로 저장).
 *
 * 파일명 규칙(런코리아 요청):
 * - 항상 고정 파일명 `LOGEN_EXPORT_FILENAME` 하나만 사용.
 * - "송장인쇄" 클릭 시마다 동일 파일에 덮어쓰기 (createWritable 기본 동작).
 * - 로젠 프로그램이 항상 같은 파일에서 최신 내용을 읽으면 되므로 파일 누적 X.
 *
 * IndexedDB DB 명: `logen-folder`, 스토어 `handles`, key `logen-upload-folder`.
 * key-value 스토어 하나만 필요하므로 별도 라이브러리 없이 얇게 구현.
 */

const DB_NAME = 'logen-folder';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'logen-upload-folder';

/**
 * 로젠 업로드 파일의 고정 파일명. 이 상수 하나만 바꾸면 전 경로에 반영.
 * "★" 는 Windows/Mac 파일시스템에서 사용 가능한 특수문자.
 */
export const LOGEN_EXPORT_FILENAME = '★로젠송장★.xlsx';

// ────────────────────────────────────────────────────────────
// FS Access API — 브라우저 타입 안전 래퍼
// ────────────────────────────────────────────────────────────

export function isFolderPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// TS lib.dom 에 FileSystemDirectoryHandle 정의가 있으나 permission API 시그니처는
// Chromium 확장. 여기서 사용하는 최소 형태만 재선언.
interface DirHandlePermState {
  queryPermission?: (opts: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (opts: { mode: 'readwrite' }) => Promise<PermissionState>;
}
type ExtendedDirHandle = FileSystemDirectoryHandle & DirHandlePermState;

async function ensureRwPermission(handle: ExtendedDirHandle): Promise<boolean> {
  if (typeof handle.queryPermission === 'function') {
    const cur = await handle.queryPermission({ mode: 'readwrite' });
    if (cur === 'granted') return true;
  }
  if (typeof handle.requestPermission === 'function') {
    const req = await handle.requestPermission({ mode: 'readwrite' });
    return req === 'granted';
  }
  return true; // permission API 미지원 브라우저는 시도해봄
}

// ────────────────────────────────────────────────────────────
// IndexedDB helpers — 최소 key-value
// ────────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/** 폴더 선택 다이얼로그 호출. 사용자 취소 시 null. 미지원 브라우저면 null. */
export async function pickLogenFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFolderPickerSupported()) return null;
  try {
    // @ts-expect-error — showDirectoryPicker 는 Chromium 전용, TS lib.dom 미포함
    const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      id: 'logen-upload-folder',
    });
    return handle;
  } catch (err) {
    // 사용자 취소는 AbortError
    if ((err as { name?: string } | null)?.name === 'AbortError') return null;
    throw err;
  }
}

export async function saveLogenFolderHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  await idbSet(HANDLE_KEY, handle);
}

/**
 * IndexedDB 에 저장된 handle 을 반환. 없거나 권한이 없으면 null.
 * 권한이 없을 때 재요청은 유저 제스처(클릭) 컨텍스트에서만 성공하므로
 * 이 함수는 호출부(클릭 핸들러)에서 실행되어야 함.
 */
export async function getLogenFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFolderPickerSupported()) return null;
  const stored = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
  if (!stored) return null;
  const ok = await ensureRwPermission(stored as ExtendedDirHandle);
  if (!ok) return null;
  return stored;
}

export async function clearLogenFolderHandle(): Promise<void> {
  await idbDelete(HANDLE_KEY);
}

/** 폴더 handle 의 사용자용 이름(name)만 노출. UI 표시용. */
export function getLogenFolderName(handle: FileSystemDirectoryHandle): string {
  return handle.name;
}

/**
 * 폴더 안 고정 파일명(LOGEN_EXPORT_FILENAME) 에 덮어쓰기.
 * createWritable() 은 keepExistingData 옵션 없이는 기본적으로 파일 내용을 비우고
 * 새로 쓰므로 자연스럽게 overwrite 됨. 반환값: 저장된 파일명.
 */
export async function writeLogenExcelFile(
  handle: FileSystemDirectoryHandle,
  data: ArrayBuffer,
): Promise<string> {
  const fileHandle = await handle.getFileHandle(LOGEN_EXPORT_FILENAME, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
  return LOGEN_EXPORT_FILENAME;
}

/**
 * 브라우저 다운로드 폴더로 저장 (미지원 브라우저 폴백).
 * 파일명은 고정. 실제 덮어쓰기 여부는 브라우저 설정에 따라 다름(코드로 제어 불가).
 */
export function downloadBlobToUserFolder(data: ArrayBuffer): void {
  const blob = new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = LOGEN_EXPORT_FILENAME;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
