import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  

  const guest = await prisma.user.upsert({
  where: { email: 'guest@transcendence.local' },
  update: {},
  create: {
    email: 'guest@transcendence.local',
    username: 'Guest',
    displayName: 'Guest',
    password: null,
  },
});

  await prisma.channel.upsert({
    where: { name: 'general' },
    update: {},
    create: { name: 'general' },
  });

  console.log('✅ Seed completado:', {guest });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
