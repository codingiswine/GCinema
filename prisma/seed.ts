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
