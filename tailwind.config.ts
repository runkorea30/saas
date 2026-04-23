import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * 설정 방침:
 * - shadcn/ui 표준 토큰(--background, --primary 등)은 `hsl(var(--*))` 브릿지로 연결.
 *   이 HSL 값들은 `src/index.css`의 HEX 디자인 토큰을 변환해서 넣은 것.
 * - Claude Design 고유 토큰(--ink-2, --brand-wash, --side-bg 등)은 `var(--*)`를
 *   직접 노출해 `bg-brand-wash`, `text-ink-2` 식으로 사용 가능하게 함.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // ───── shadcn 표준 (HSL 브릿지) ─────
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // ───── Claude Design 고유 토큰 (var() 직접 참조) ─────
        ink: {
          DEFAULT: 'var(--ink)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
        },
        brand: {
          DEFAULT: 'var(--brand)',
          deep: 'var(--brand-deep)',
          ink: 'var(--brand-ink)',
          wash: 'var(--brand-wash)',
          'wash-2': 'var(--brand-wash-2)',
        },
        tan: {
          DEFAULT: 'var(--tan)',
          wash: 'var(--tan-wash)',
        },
        success: {
          DEFAULT: 'var(--success)',
          wash: 'var(--success-wash)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          wash: 'var(--warning-wash)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          wash: 'var(--danger-wash)',
        },
        info: {
          DEFAULT: 'var(--info)',
          wash: 'var(--info-wash)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
          sunken: 'var(--bg-sunken)',
        },
        side: {
          bg: 'var(--side-bg)',
          'bg-2': 'var(--side-bg-2)',
          line: 'var(--side-line)',
          ink: {
            DEFAULT: 'var(--side-ink)',
            2: 'var(--side-ink-2)',
            dim: 'var(--side-ink-dim)',
          },
        },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
      },
      fontFamily: {
        sans: ['Pretendard Variable', 'Pretendard', 'Inter Tight', 'system-ui', 'sans-serif'],
        num: ['Inter Tight', 'Pretendard Variable', 'ui-sans-serif', 'sans-serif'],
        display: ['Fraunces', 'Pretendard Variable', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [animate],
};

export default config;
