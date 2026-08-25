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
    description: `이 시대 영화계 최고의 거장 크리스토퍼 놀란 감독의 새로운 신화
인류 최고의 고전 [오디세이아]가 스크린에 펼쳐진다!

10년간 이어진 트로이 전쟁을 승리로 이끈 영웅 '오디세우스'(맷 데이먼)는
왕의 부재를 틈타 침탈과 권력 다툼이 벌어진 왕국에서
그를 기다리고 있는 아내 '페넬로페'(앤 해서웨이)와
아들 '텔레마코스'(톰 홀랜드)에게 돌아가기 위한 여정에 나선다.
그러나 신들의 분노를 산 그의 귀환 앞에는 거대한 폭풍과 괴물들,
그리고 거스를 수 없는 운명의 시련이 기다리고 있는데…`,
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
    description: `세상 모두에게 잊힌 피터 파커
그의 정체를 기억하는 역대급 빌런의 등장
시리즈 사상 가장 통제할 수 없는 대결이 시작된다!

4년 전 소중한 사람들을 지키기 위해 모두의 기억에서 사라진 '피터 파커'.
친절한 이웃 '스파이더맨'으로서 뉴욕을 지키며 고독한 삶을 살아가던 '피터'는
어느 날, 예상치 못한 DNA 변이로 인해 통제 불가능한 힘에 사로잡히고
그의 진짜 정체를 알고 있는 적까지 마주하게 된다.

타인의 의식을 조종하는 정체불명의 존재로 인해
모두가 '피터'를 노리는 적이 될 수 있는 혼란 속에서
'피터'는 다시 위협에 빠진 'MJ'와 모두를 지키기 위해
'스파이더맨'으로 그들 앞에 서게 되는데...`,
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
    description: `엄마 '옥실'(이정은)과 세 딸 '장주'(공효진), '영주'(박소담), '동주'(이연)는
8년 전 수학여행을 떠난 이후 다시는 돌아오지 못한 막내 '경주'의 생일을 맞아
단체 티셔츠까지 맞춰 입고 경주로 가족여행을 떠난다.

얼핏 단란하고 화목한 가족여행처럼 보이지만,
봉고차 트렁크에는 낯선 한 남자가 실려 있는데…`,
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
    description: `우리 동네가 공룡들의 사냥터가 되었다!

목표는 단 하나, 무조건 살아남아라!

1982년, 평화롭던 '오크 스트리트' 마을이

하루아침에 통째로 선사시대로 옮겨졌다.

익숙했던 집과 골목은 순식간에 공룡들의 사냥터로 변하고,

육지와 하늘, 물속까지 점령한 거대 포식자들의 무차별 공격이 시작된다!

과연 '플랫' 가족은 무사히 살아남아 원래의 일상으로 돌아갈 수 있을까?`,
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
