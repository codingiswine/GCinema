import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.booking.deleteMany();
  await prisma.showtime.deleteMany();
  await prisma.movie.deleteMany();

  const movieData = [
    { title: '오디세이', genre: '액션/모험', runningTimeMin: 141, posterUrl: '/posters/1.jpg' },
    { title: '스파이더맨: 브랜드 뉴 데이', genre: '액션', runningTimeMin: 130, posterUrl: '/posters/2.jpg' },
    { title: '경주기행', genre: '스릴러', runningTimeMin: 105, posterUrl: '/posters/3.jpg' },
    { title: '오크 스트리트의 마지막 날', genre: '액션/코미디', runningTimeMin: 98, posterUrl: '/posters/4.jpg' },
    { title: '호프', genre: '액션', runningTimeMin: 115, posterUrl: '/posters/5.jpg' },
  ];

  const movies = [];
  for (const m of movieData) {
    movies.push(await prisma.movie.create({ data: m }));
  }

  const now = new Date();
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);

  for (const movie of movies) {
    await prisma.showtime.createMany({
      data: [
        { movieId: movie.id, theaterName: '리클라이너관 1', startAt: hoursFromNow(2), rows: 5, cols: 17 },
        { movieId: movie.id, theaterName: '리클라이너관 2', startAt: hoursFromNow(5), rows: 5, cols: 17 },
      ],
    });
  }

  console.log(`시딩 완료: 영화 ${movies.length}개`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
