/**
 * Google Identity Services (GSI) 기반 Gmail OAuth 토큰 획득.
 *
 * 브라우저에서 Gmail API를 직접 호출하기 위한 access_token 을 받아온다.
 * - GSI 스크립트는 index.html 에서 CDN 로드 (npm 패키지 없음)
 * - `gmail.send` 스코프만 요청 (메일 발송 전용, 읽기 권한 없음)
 * - 토큰 유효시간 1시간 — 만료 후엔 재로그인 필요
 *
 * 🟠 OAuth 앱은 현재 "테스트" 모드 → runkorea30@gmail.com 만 사용 가능 (의도된 동작).
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

// GSI 글로벌 객체 최소 타입.
interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GoogleAccountsOauth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
  }) => GoogleTokenClient;
}

interface GoogleGlobal {
  accounts: {
    oauth2: GoogleAccountsOauth2;
  };
}

declare global {
  interface Window {
    google?: GoogleGlobal;
  }
}

/** GSI 스크립트가 로드될 때까지 대기 (최대 5초). */
function waitForGsi(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = window.setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        window.clearInterval(interval);
        resolve();
      } else if (Date.now() - start > 5000) {
        window.clearInterval(interval);
        reject(new Error('Google Identity Services 스크립트 로드 실패'));
      }
    }, 100);
  });
}

/**
 * 사용자에게 Google 계정 선택 팝업을 띄우고 access_token 을 받아온다.
 * 호출 시점이 사용자 클릭 직후여야 팝업 차단을 피할 수 있다.
 */
export async function requestGmailAccessToken(): Promise<string> {
  if (!CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID 환경변수가 설정되지 않았습니다.');
  }
  await waitForGsi();

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: GMAIL_SEND_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(
            new Error(
              response.error_description ?? response.error ?? '인증 실패',
            ),
          );
          return;
        }
        if (response.access_token) {
          resolve(response.access_token);
        } else {
          reject(new Error('access_token 을 받지 못했습니다.'));
        }
      },
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
}
