import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User';

dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('✅ Connected to MongoDB');

        const users = await User.find({ role: 'user' })
            .select('email username emailVerified registrationSource modules createdAt')
            .sort({ createdAt: -1 });

        console.log(`📋 Found ${users.length} student accounts:`);
        for (const u of users) {
            console.log(`- Email: ${u.email || u.username}`);
            console.log(`  Verified: ${u.emailVerified}`);
            console.log(`  Source: ${u.registrationSource}`);
            console.log(`  Modules: ${JSON.stringify(u.modules)}`);
            console.log(`  Created: ${u.createdAt}`);
            console.log('-------------------------------');
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

check();
