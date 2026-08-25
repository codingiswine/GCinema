import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DAYS_AHEAD = 7;
const COLS = 14;

// 박스오피스 1~2위인 오디세이/스파이더맨은 같은 시간표(오디세이 심야 포함)를 쓴다.
const TOP_MOVIE_TIMES = ['10:35', '14:00', '17:15', '20:35', '23:50'];

// Real GCinema-style capacities per movie. 67 isn't a clean multiple of
// COLS, so that hall's last row ends up partially filled (see seatLabels
// in src/routes/bookings.ts).
const movieData = [
  {
    title: '오디세이',
    genre: '액션/모험',
    runningTimeMin: 172,
    ageRating: '15',
    posterUrl: '/posters/1.jpg',
    detailImageUrl: '/details/1.webp',
    description:
      '고향으로 돌아가는 길을 잃은 한 남자가 신들의 시험과 괴물들의 추격을 뚫고 나아가는 여정.\n' +
      '바다를 건널수록 그를 기다리는 것이 귀환인지 파멸인지 알 수 없다.\n\n' +
      '모든 것을 걸고 떠난 항해, 그 끝에서 마주하는 진짜 적은 따로 있다.',
    theaterName: '1관',
    totalSeats: 84,
    times: TOP_MOVIE_TIMES,
    satisfactionPercent: 98,
    bookingRatePercent: 71,
    cumulativeViewers: '729.5만',
  },
  {
    title: '스파이더맨: 브랜드 뉴 데이',
    genre: '액션',
    runningTimeMin: 145,
    ageRating: '12',
    posterUrl: '/posters/2.jpg',
    detailImageUrl: '/details/2.webp',
    description:
      '새로운 도시, 새로운 얼굴들 속에서 다시 시작하는 스파이더맨의 하루하루.\n' +
      '평범한 삶을 지키려 할수록 그를 노리는 위협은 더 커져만 간다.\n\n' +
      '가면 속에 숨긴 진짜 얼굴을 지킬 수 있을까.',
    theaterName: '2관',
    totalSeats: 84,
    times: TOP_MOVIE_TIMES,
    satisfactionPercent: 97,
    bookingRatePercent: 8.8,
    cumulativeViewers: '817.3만',
  },
  {
    title: '경주기행',
    genre: '스릴러',
    runningTimeMin: 111,
    ageRating: '15',
    posterUrl: '/posters/3.jpg',
    detailImageUrl: '/details/3.webp',
    description:
      '오랜만에 다시 모인 가족이 함께 떠난 경주 여행.\n' +
      '화목해 보이는 겉모습 뒤에는 저마다 감춰온 사정이 있다.\n\n' +
      '여행이 계속될수록 드러나는 진실 앞에서, 가족은 예전으로 돌아갈 수 있을까.',
    theaterName: '3관',
    totalSeats: 42,
    times: ['10:30', '12:45', '17:20', '21:50'],
    satisfactionPercent: 95,
    bookingRatePercent: 4.1,
    cumulativeViewers: '15.2만',
  },
  {
    title: '오크 스트리트의 마지막 날',
    genre: '액션/코미디',
    runningTimeMin: 99,
    ageRating: '12',
    posterUrl: '/posters/4.jpg',
    detailImageUrl: '/details/4.webp',
    description:
      '재개발을 앞둔 오크 스트리트에서 벌어지는 하루 동안의 좌충우돌 소동극.\n' +
      '동네를 지키려는 이웃들과 이를 막으려는 세력이 정면으로 부딪힌다.\n\n' +
      '웃음과 액션 사이, 이 거리의 마지막 하루가 시작된다.',
    theaterName: '4관',
    totalSeats: 67,
    times: ['10:30', '13:10', '17:40', '20:50'],
    satisfactionPercent: 92,
    bookingRatePercent: 3.7,
    cumulativeViewers: '12.8만',
  },
  // 상영관을 4개로만 정리하는 편이 화면이 깔끔해서 호프는 잠시 숨겨둠.
  // {
  //   title: '호프',
  //   genre: '액션',
  //   runningTimeMin: 166,
  //   ageRating: '15',
  //   posterUrl: '/posters/5.jpg',
  //   theaterName: '5관',
  //   totalSeats: 60,
  //   times: ['11:00', '15:30', '20:00'],
  //   satisfactionPercent: 90,
  //   bookingRatePercent: 2.5,
  //   cumulativeViewers: '8.4만',
  // },
];

async function main() {
  await prisma.booking.deleteMany();
  await prisma.showtime.deleteMany();
  await prisma.movie.deleteMany();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const m of movieData) {
    const movie = await prisma.movie.create({
      data: {
        title: m.title,
        genre: m.genre,
        runningTimeMin: m.runningTimeMin,
        ageRating: m.ageRating,
        posterUrl: m.posterUrl,
        detailImageUrl: m.detailImageUrl,
        description: m.description,
        satisfactionPercent: m.satisfactionPercent,
        bookingRatePercent: m.bookingRatePercent,
        cumulativeViewers: m.cumulativeViewers,
      },
    });

    const showtimeData = [];
    for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
      for (const time of m.times) {
        const [hour, minute] = time.split(':').map(Number);
        const startAt = new Date(today);
        startAt.setDate(startAt.getDate() + dayOffset);
        startAt.setHours(hour, minute, 0, 0);
        showtimeData.push({
          movieId: movie.id,
          theaterName: m.theaterName,
          startAt,
          totalSeats: m.totalSeats,
          cols: COLS,
        });
      }
    }
    await prisma.showtime.createMany({ data: showtimeData });
  }

  console.log(`시딩 완료: 영화 ${movieData.length}개, ${DAYS_AHEAD}일치 상영시간표`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
