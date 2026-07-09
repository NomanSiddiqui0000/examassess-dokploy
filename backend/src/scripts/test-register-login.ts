import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User';
import bcrypt from 'bcryptjs';
import axios from 'axios';

dotenv.config();

async function test() {
    try {
        console.log('--- Testing Student Registration & Verification Block ---');
        await mongoose.connect(process.env.MONGODB_URI!);
        
        const TestCategory = mongoose.model('TestCategory', new mongoose.Schema({ isActive: Boolean }));
        const category = await TestCategory.findOne({ isActive: true });
        if (!category) {
            console.error('No active test category found in DB');
            process.exit(1);
        }
        console.log('Found category:', category.id);
        
        // 1. Try to register nomandotdev@gmail.com for practice
        console.log('Sending registration request for nomandotdev@gmail.com...');
        try {
            const regRes = await axios.post('http://localhost:5000/api/auth/user/register', {
                fullName: 'Noman Test',
                email: 'nomandotdev@gmail.com',
                password: 'password123',
                testCategoryId: category.id
            });
            console.log('Registration Response Status:', regRes.status);
            console.log('Registration Response Body:', JSON.stringify(regRes.data, null, 2));
        } catch (regErr: any) {
            console.error('Registration failed:', regErr.response?.data || regErr.message);
        }

        // 2. Try to log in as nomandotdev@gmail.com
        console.log('\nSending login request for nomandotdev@gmail.com...');
        try {
            const loginRes = await axios.post('http://localhost:5000/api/auth/user/login', {
                username: 'nomandotdev@gmail.com',
                password: 'password123'
            });
            console.log('Login Response Status:', loginRes.status);
            console.log('Login Response Body:', JSON.stringify(loginRes.data, null, 2));
            console.log('❌ SUCCESS? Login allowed without verification!');
        } catch (loginErr: any) {
            console.log('Login failed as expected/unexpected:');
            console.log('Status:', loginErr.response?.status);
            console.log('Body:', JSON.stringify(loginErr.response?.data, null, 2));
        }

        process.exit(0);
    } catch (e) {
        console.error('Test script error:', e);
        process.exit(1);
    }
}

test();
