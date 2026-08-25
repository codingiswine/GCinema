import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.booking.deleteMany();
  await prisma.showtime.deleteMany();
  await prisma.movie.deleteMany();

  const movies = await Promise.all(
    [
      { title: '인터스텔라', genre: 'SF', runningTimeMin: 169 },
      { title: '기생충', genre: '드라마', runningTimeMin: 132 },
      { title: '스파이더맨: 어크로스 더 유니버스', genre: '애니메이션', runningTimeMin: 141 },
    ].map((m) => prisma.movie.create({ data: m }))
  );

  const now = new Date();
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);

  for (const movie of movies) {
    await prisma.showtime.createMany({
      data: [
        { movieId: movie.id, theaterName: '1관', startAt: hoursFromNow(2), rows: 4, cols: 6 },
        { movieId: movie.id, theaterName: '2관', startAt: hoursFromNow(5), rows: 4, cols: 6 },
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
