# Jinyong Jeong Dev Blog

LLM, Federated Learning, 논문 리뷰, 실험 로그를 기록하는 Astro 기반 개발 블로그입니다.

사이트: <https://jinyong-jeong.github.io>

## 개발 실행

```bash
npm install
npm run dev
```

빌드 확인:

```bash
npm run check
npm run build
```

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

프로필, 링크, 기술 스택, 사이드바 노출 항목은 `src/config/site.ts`에서 수정합니다.

수정할 가능성이 높은 값:

- `site.author`
- `site.socials`
- `site.techStack`
- `site.focusAreas`

## 프로젝트 작성

프로젝트는 `content/projects/{slug}.mdx`에 작성합니다.

`featured: true`인 프로젝트는 홈과 사이드바에 우선 노출됩니다.

## 배포

이 저장소는 GitHub Pages 사용자 사이트입니다.

- 저장소: `JinYong-Jeong/JinYong-Jeong.github.io`
- 사이트 URL: `https://jinyong-jeong.github.io`
- Astro `base` 설정은 사용하지 않습니다.
- GitHub Settings > Pages > Source는 `GitHub Actions`로 설정합니다.

`main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 실행되어 자동 배포됩니다.

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
