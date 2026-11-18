# Jinyong Jeong — Interactive CV

정진용의 학업과 연구, 개발, 동아리 활동을 담은 Astro 기반 인터랙티브 CV입니다. 책상 위 기록집에서 관심 있는 페이지를 펼치고, 그 경험에 관해 페르소나 챗봇과 대화하거나 연결된 이력과 원문을 읽을 수 있습니다.

사이트: <https://jinyong-jeong.github.io>

## 개발 실행

Node.js 22를 사용합니다 (`.nvmrc`). 잠금 파일에 맞춰 의존성을 설치합니다.

```bash
npm ci
npm run dev
```

빌드 확인:

```bash
npm run check
node --test tests/*.test.mjs
npm run build
```

개발 서버는 기본적으로 `http://localhost:4321`에서 실행됩니다. 디자인과 인터랙션, 파일별 수정 위치는 [디자인 시스템 문서](docs/DESIGN_SYSTEM.md)에 정리되어 있습니다.

## 방문자 브라우저에서 실행하는 챗봇

GitHub Pages는 정적 사이트를 제공합니다. WebGPU를 지원하는 브라우저에서 **공개 페이지에 들어오면** 대화창을 열지 않아도 WebLLM이 4비트로 양자화된 Qwen3 1.7B를 자동으로 내려받습니다(약 1GB). GPU가 `shader-f16`을 지원하면 `q4f16_1`, 그 밖에는 `q4f32_1`을 사용합니다. 준비 중에도 현재 페이지나 공개 CV 기록에 대해 질문할 수 있습니다.

준비가 끝나면 방문자의 GPU에서 관련 CV 기록과 최근 대화를 바탕으로 답변을 생성합니다. Astro의 `ClientRouter`가 같은 사이트의 메뉴와 글 이동을 처리하고, `transition:persist`로 대화창과 모델을 유지하므로 내부 이동마다 모델을 다시 받지 않습니다. 질문의 페이지 근거는 이동한 페이지에서 새로 읽습니다. 뒤로·앞으로 이동과 대화창을 접었다 펴는 동작에서도 대화와 입력 초안이 유지됩니다.

모델 파일은 해당 탭의 메모리에서만 사용합니다. 새로고침·외부 사이트 이동·탭 종료처럼 실제 문서를 떠나는 `pagehide`에서는 AI 실행을 종료합니다. 브라우저의 뒤로 가기 캐시에서 문서가 복원되면 모델을 다시 준비합니다. 관리자 화면은 기존 독립 문서 방식으로 이동합니다. WebGPU 미지원 환경에서는 공개 기록 검색과 근거 링크를 이용할 수 있습니다.

로컬에서는 `npm run dev`로 같은 기능을 확인할 수 있습니다. 빌드 후 `dist/`를 HTTPS 정적 호스팅 또는 localhost에서 제공해도 동작합니다.

## 수정할 파일 찾기

| 수정 내용 | 파일 |
| --- | --- |
| 홈 CV의 경력·학력·논문·수상·대표 프로젝트 | `src/config/cv.ts` |
| 사이트 제목·설명·내비게이션·공통 링크 | `src/config/site.ts` |
| Primary/secondary 색상, 글꼴, 간격, 모션 토큰 | `src/styles/tokens.css` |
| 홈 섹션 구성과 스타일 | `src/pages/index.astro`, `src/styles/cv.css` |
| 홈 목차·프로젝트 파일·이메일 복사·CV 인쇄 | `src/scripts/cv.ts` |
| 공개 페이지 이동·챗봇 유지·앵커 복원 | `src/layouts/BaseLayout.astro`, `src/scripts/public-navigation.ts`, `src/components/PersonaGuide.astro` |
| 인터랙티브 기록집 | `src/components/RecordDesk.astro`, `src/scripts/record-desk.ts` |
| 페르소나의 공개 근거와 대화 | `src/config/persona.ts`, `src/lib/persona.ts`, `src/components/PersonaGuide.astro` |
| 현재 페이지 질문과 본문 근거 선택 | `src/lib/persona-page.ts`, `src/scripts/persona-guide.ts` |
| Writing / Work 목록과 공통 스타일 | `src/pages/blog/index.astro`, `src/pages/projects/index.astro`, `src/styles/archive.css` |
| 별도 About 페이지 | `content/about/page.json` (`/admin/about/`에서 편집 가능) |

CV와 About은 별도의 콘텐츠입니다. About 관리자에서 저장한 내용이 홈 CV에 자동 반영되지는 않습니다. 홈의 논문은 게재와 게재 확정·발행 예정을 구분하며, 확인되지 않은 수상 날짜는 임의로 입력하지 않습니다.

## 새 글 작성

글은 `content/posts/{category}/{YYYY-MM-DD-slug}.mdx`에 작성합니다.

사용 가능한 category:

- `llm`
- `federated-learning`
- `paper-review`
- `experiment-log`
- `development`

권장 흐름:

1. `templates/`의 템플릿을 복사합니다.
2. `content/posts/{category}/` 아래에 `YYYY-MM-DD-slug.mdx` 이름으로 저장합니다.
3. frontmatter의 `title`, `description`, `date`, `category`, `tags`를 채웁니다.
4. 아직 공개하지 않을 글은 `draft: true`로 둡니다.
5. 공개할 때 `draft: false`로 바꾸고 `main`에 push합니다.

## 프로필 수정

홈의 주요 이력은 `src/config/cv.ts`에서 수정합니다. 공통 프로필, 링크, 기술 스택, 기존 상세 페이지의 사이드바 노출 항목은 `src/config/site.ts`에서 수정합니다.

수정할 가능성이 높은 값:

- `site.author`
- `site.socials`
- `site.techStack`
- `site.focusAreas`

## 프로젝트 작성

홈의 대표 작업은 `src/config/cv.ts`의 `work`에서 관리합니다. `/projects/`의 전체 목록은 `content/projects/github-selection.json`에 지정한 GitHub 저장소를 빌드 시 불러옵니다. `/admin/projects/`에서 저장소 선택과 설명을 편집할 수 있습니다.

`content/projects/{slug}.mdx`는 GitHub 목록을 사용할 수 없을 때의 로컬 대체 콘텐츠입니다. 이 파일의 `featured`는 해당 목록을 사용하는 기존 구성요소에 적용되며, 홈의 대표 작업 선정은 `cv.work`를 따릅니다.

## 배포

이 저장소는 GitHub Pages 사용자 사이트입니다.

- 저장소: `JinYong-Jeong/JinYong-Jeong.github.io`
- 사이트 URL: `https://jinyong-jeong.github.io`
- Astro `base` 설정은 사용하지 않습니다.
- GitHub Settings > Pages > Source는 `GitHub Actions`로 설정합니다.

`main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 실행되어 자동 배포됩니다.

2026-11-17 CV 중심 개편은 로컬 작업으로 준비했습니다. 이 작업에서 운영 사이트에 대한 push나 배포는 수행하지 않았습니다.

기존 정적 HTML 사이트는 `archive/pre-astro-blog-20260426` 브랜치에 백업되어 있습니다.

## 관리자 화면 설정

게시글 관리 화면은 `/admin/`에 있습니다. GitHub 저장소의 `content/posts` 파일을 직접 생성, 수정, 삭제하고 저장할 때마다 `main` 브랜치에 커밋을 생성합니다.

관리자 화면 기능:

- GitHub 계정 로그인 및 저장소 소유자 확인
- 게시글 목록과 검색
- 제목, 설명, 날짜, 카테고리, 태그, 공개 상태 편집
- Markdown/MDX 본문 작성과 미리보기
- 게시글 생성, 수정, 삭제

### 1. GitHub App 생성

GitHub Settings > Developer settings > GitHub Apps에서 앱을 생성합니다.

- Homepage URL: `https://jinyong-jeong.github.io`
- Callback URL: `https://jinyong-jeong.github.io/admin/`
- User authorization callback URL도 같은 주소를 사용합니다.
- Repository permissions > Contents: `Read and write`
- 설치 대상: `JinYong-Jeong/JinYong-Jeong.github.io`

### 2. 인증 API 배포

`admin-auth/`는 GitHub 로그인 코드를 토큰으로 교환하는 Cloudflare Worker입니다. GitHub Client Secret은 브라우저나 저장소에 넣지 않고 Worker secret으로만 저장합니다.

```bash
cd admin-auth
npm install
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npm run deploy
```

로컬 개발에서는 `admin-auth/.dev.vars.example`을 `.dev.vars`로 복사해 값을 입력합니다. `.dev.vars`는 커밋하지 않습니다.

### 3. GitHub Pages 빌드 변수 등록

Repository Settings > Secrets and variables > Actions > Variables에 아래 값을 등록합니다.

- `PUBLIC_GITHUB_CLIENT_ID`: GitHub App Client ID
- `PUBLIC_GITHUB_AUTH_API_URL`: 배포된 Worker URL. 예: `https://jinyong-blog-admin-auth.<subdomain>.workers.dev`

`.github/workflows/deploy.yml`이 이 값을 Astro 빌드에 전달하도록 설정되어 있습니다.
