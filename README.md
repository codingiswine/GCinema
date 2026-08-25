# GCmediai 영화 티켓 예매 시스템

GCmediai 개발 직군 과제 제출용 프로젝트입니다.

## 실행 방법

### 1. 사전 준비
- Node.js 18+ (개발/테스트: Node 24)
- Docker (PostgreSQL 실행용)

### 2. 설치 및 DB 기동
```bash
npm install
cp .env.example .env
docker compose up -d          # PostgreSQL 컨테이너 기동
npx prisma migrate dev        # 스키마 마이그레이션
npx prisma db seed            # 영화/상영시간 더미 데이터 시딩
```

### 3. 서버 실행
```bash
npm run dev        # 개발 모드 (파일 변경 시 자동 재시작)
# 또는
npm start          # ts-node로 바로 실행
```
브라우저에서 http://localhost:3000 접속.

### 4. 테스트
```bash
npm test           # Jest + supertest, 실제 DB에 대해 회원가입/로그인/예매/중복예매 플로우 검증
npm run build       # tsc 타입 체크
```

## 프로젝트 구조
```
prisma/
  schema.prisma        # User / Movie / Showtime / Booking 모델
  seed.ts               # 더미 영화·상영시간 데이터
src/
  app.ts                 # express 앱 조립 (세션, 뷰엔진, 라우트 등록)
  db.ts                  # PrismaClient 싱글턴
  middleware/auth.ts      # 로그인 필요 라우트 가드
  routes/
    auth.ts               # 회원가입 / 로그인 / 로그아웃
    movies.ts              # 영화 목록 / 상영시간 목록
    bookings.ts             # 좌석 조회 / 예매 / 예매 내역
  views/*.ejs              # 서버 렌더링 화면
  public/style.css          # 최소 스타일
test/booking.test.ts        # 회원가입/로그인/예매 성공/중복예매 실패 스모크 테스트
docker-compose.yml           # PostgreSQL 컨테이너
```

## 설계 의도

- **Seat 테이블을 두지 않음**: 좌석은 `Showtime.rows x cols`로 그리드 크기만 정의하고, 좌석 상태(예매됨/비어있음)는 그 상영시간에 걸린 `Booking`을 조회해서 계산합니다. 좌석 상태를 별도로 저장하지 않으므로 예매 테이블과 좌석 상태가 어긋나는 동기화 버그가 원천적으로 없습니다.
- **중복 예매 방지는 DB 제약으로**: `Booking`에 `@@unique([showtimeId, seatLabel])` 제약을 걸어, 동시에 같은 좌석을 예매하려는 두 요청이 와도 앱 레벨 락 없이 DB가 하나만 성공시키고 나머지는 unique violation(Prisma 코드 `P2002`)으로 실패합니다. 이 경우 409 응답과 함께 "이미 예약된 좌석입니다" 메시지를 보여줍니다.
- **세션 기반 인증**: 서버 렌더링 UI와 궁합이 좋고, 브라우저가 쿠키를 자동으로 들고 다니므로 프론트엔드에 토큰 관리 코드가 필요 없습니다. 비밀번호는 bcrypt로 해시하여 저장합니다.
- **서버 렌더링(EJS) UI**: 회원가입 → 로그인 → 영화 선택 → 상영시간 선택 → 좌석 선택/예매 → 예매 내역까지 브라우저에서 바로 시연할 수 있도록 최소한의 화면을 구성했습니다. SPA나 API-only보다 과제 검토 시 실제 동작을 확인하기 쉽습니다.

## 고려한 사항

- **과제 주의사항("과도한 기능 구현 지양")**을 고려해, 요구된 4개 핵심 기능(회원가입/로그인, 영화·상영시간 조회, 좌석 예매, 예매 내역 조회) 외의 기능(결제, 좌석 취소, 관리자 페이지 등)은 구현하지 않았습니다.
- **테스트 범위도 최소화**: 전체 화면/라우트에 대한 테스트 대신, 실제 서비스에서 버그가 나면 가장 치명적인 예매/중복예매 로직에만 스모크 테스트(4개)를 두었습니다.
- **비밀번호 정책, 이메일 인증, rate limiting** 등은 실 서비스라면 필요하지만 과제 범위를 벗어난다고 판단해 제외했습니다.
- **실행 재현성**: `docker-compose.yml`로 DB를 고정해, 리뷰어의 로컬 환경과 무관하게 동일하게 재현되도록 했습니다.
- **빌드 방식**: `tsc`로 컴파일 후 `dist/`를 실행하는 대신 `ts-node`로 소스를 직접 실행하도록 했습니다. EJS 뷰·정적 파일을 `dist/`로 복사하는 빌드 파이프라인을 추가하지 않기 위한 의도적인 단순화이며, `npm run build`는 타입 체크(`tsc --noEmit`) 용도로만 사용합니다.

## (선택) 추가 구현 내용
- 없음 (핵심 기능 위주로 범위를 제한했습니다.)
