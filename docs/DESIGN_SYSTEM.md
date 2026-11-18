# 정진용의 인터랙티브 CV

홈의 주제는 정진용의 학업과 연구, 직접 만든 프로젝트, 함께한 사람들과의 활동입니다. 방문자는 책상 위 기록집을 펼치거나 공개 기록에 관해 질문하거나 한 페이지의 이력을 바로 읽을 수 있습니다.

## 화면과 콘텐츠

| 경로 | 구성 |
| --- | --- |
| `/` | 기록집, 경력·학력, 대표 프로젝트, 논문, 수상, 글, 연락처 |
| `/projects/` | 공개 저장소 목록과 검색 |
| `/blog/` | 글 목록, 카테고리와 검색 |
| `/about/` | 기존 소개 페이지 |
| `/admin/`, `/admin/projects/`, `/admin/about/` | 기존 콘텐츠 관리 화면 |

`src/config/cv.ts`가 홈과 대화의 공통 이력 데이터입니다. 경력, 학력, 논문, 수상은 소유자의 공개 프로필을 바탕으로 작성했습니다. 연구실 시작 시점은 기존 사이트의 기록을 따릅니다. 논문에는 저자 역할 및 게재·발행 예정 상태를 보존하고, 날짜를 확인하지 못한 수상에는 `—`를 표시합니다. [LinkedIn 프로필](https://www.linkedin.com/in/jinyongjeong/)

## 색상과 서체

공통 UI의 색상과 서체는 `src/styles/tokens.css`에서 관리합니다. 책 표지·종이·나뭇결 재질은 `src/styles/record-desk.css`에 한정합니다.

| 역할 | 토큰 | 색상 | 사용처 |
| --- | --- | --- | --- |
| 기본 바탕 | `--color-paper` | `#f7f3eb` | 페이지 |
| Primary | `--color-primary` | `#3f3028` | 큰 제목, 주 동작, 링크 |
| Secondary | `--color-secondary` | `#536254` | 이름의 성, 선택된 기록, 보조 제목 |
| Bronze | `--color-bronze` | `#98764e` | 작은 강조 |
| 본문 | `--color-ink` | `#292722` | 글 |
| 보조 글 | `--color-muted` | `#70685e` | 날짜와 출처 |
| 표면 | `--color-surface` | `#fffcf6` | 파일과 대화창 |
| 경계선 | `--color-border` | `#dcd3c5` | 구획 |
| 키보드 초점 | `--color-focus` | `#725539` | 조작 중인 요소 |

영문 제목은 원 사이트의 Georgia, Times New Roman 스택을 쓰고 본문은 Inter, 시스템 글꼴, 한국어 폴백 순서로 표시합니다. 헤더와 파비콘, 책 표지에 쓰는 용은 원본 `engineering/design/logo2.png`입니다. 책상 바탕은 기존 `engineering/design/bg.png`를 사용합니다.

## 상호작용

| 동작 | 구현 | 연결되는 내용 |
| --- | --- | --- |
| 표지 펼치기, 책갈피 선택, 페이지 넘기기 | `RecordDesk.astro`, `record-desk.ts`, `record-desk.css` | 학업·연구·개발·동아리 기록, 각 기록의 출처 |
| 펼쳐진 페이지에서 질문하기 | `cv:ask` 이벤트 | 질문과 관련 이력을 대화창에 전달 |
| 기록을 바탕으로 대화하기 | `PersonaGuide.astro`, `config/persona.ts`, `lib/persona.ts`, `scripts/persona-guide.ts` | 자유 입력, 후속 질문, 관련 이력·원문, 생성 중지, 새 대화 |
| CV 문서 읽기 | `pages/index.astro`, `scripts/cv.ts`, `styles/cv.css` | 경력·논문의 상세 설명, 프로젝트 파일 선택, 직접 링크, 인쇄 |
| 대화 접기와 펼치기 | `PersonaGuide.astro` | 우하단 토글로 읽던 위치와 대화 유지 |

정적 HTML에 프로젝트와 이력 전문이 들어 있습니다. 챗봇을 처음 열면 Qwen3 1.7B 다운로드가 자동으로 시작되며, 준비 중에도 공개 기록으로 답변합니다. 같은 페이지에서 챗봇을 접으면 모델과 대화를 유지합니다. 페이지를 떠나면 모델 실행을 종료하고, 다음 방문에 쓸 모델 파일을 저장하지 않습니다. 대화는 방문자 기기에서 처리하고 답변에는 관련 CV 자료를 표시합니다.

## 레퍼런스에서 가져온 동작

- 상자를 연 뒤 설명서를 직접 넘기는 동작을 기록집의 표지와 책장에 적용했습니다. [Amber · Awwwards](https://www.awwwards.com/sites/amber-2)
- 물건을 조작하면 해당 물건과 연결된 기록이 나타나는 방식을 참고해, 책상 위 책에서 실제 학력·활동과 원문을 열 수 있게 했습니다. [KINORIA · GDWEB](https://www.gdweb.co.kr/sub/view.asp?str_no=27676)
- 인물을 탐색하는 중의 대화를 참고해, 펼쳐 놓은 페이지가 챗봇의 첫 질문과 출처를 결정하도록 했습니다. [Sunny’s Journey · Awwwards](https://www.awwwards.com/sites/sunnys-journey)

## 로컬 검증

`npm run check`로 타입을 확인하고 `npm run build`로 정적 페이지를 생성합니다. 화면 변경 시 데스크톱과 좁은 화면에서 책장을 넘기고, 프로젝트에 대한 질문과 후속 질문을 보내고, 근거 링크로 돌아오는 흐름을 확인합니다.
