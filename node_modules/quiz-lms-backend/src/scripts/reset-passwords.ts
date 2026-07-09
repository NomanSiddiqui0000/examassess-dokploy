import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const users = [
  { username: 'superadmin', password: 'SuperAdmin@123' },
  { username: 'admin',      password: 'Admin@123' },
  { username: 'contentmgr', password: 'Content@123' },
];

async function reset() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db;

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 12);
    const r = await db.collection('users').updateOne(
      { username: u.username },
      { $set: { password: hash, mustChangePassword: false, isActive: true } }
    );
    console.log(`${u.username}: ${r.modifiedCount > 0 ? 'updated' : 'not found'}`);
  }

  await mongoose.disconnect();
  console.log('Done');
}

reset().catch(e => { console.error(e); process.exit(1); });
