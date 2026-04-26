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
