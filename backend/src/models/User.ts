import mongoose, { Document, Schema } from 'mongoose';
import { RegistrationSource, normalizeEmailAddress } from '../utils/email-security';

export type AdminSubRole = 'super_admin' | 'admin' | 'content_manager';
export type UserRole = AdminSubRole | 'user' | 'teacher';

export interface IUserModules {
    practiceModule: boolean;
    teacherAssessments: boolean;
}

export interface IUser extends Document {
    username: string;
    email?: string;
    fullName?: string;
    password: string;
    role: UserRole;
    isActive: boolean;
    mustChangePassword: boolean;
    lastPasswordChange?: Date;
    testCategory?: mongoose.Types.ObjectId;
    credits: number;
    modules: IUserModules;
    emailVerified: boolean;
    emailVerificationToken?: string;
    emailVerificationExpires?: Date;
    passwordResetToken?: string;
    passwordResetExpires?: Date;
    passwordResetCount: number;
    passwordResetLastRequest?: Date;
    registrationSource?: RegistrationSource;
    unverifiedAccountExpiresAt?: Date;
    lastLogin?: Date;
    createdAt: Date;
    updatedAt: Date;
    profileImage?: string;
    professionalTitle?: string;
    organization?: string;
    subjects?: string;
    bio?: string;
}

const UserSchema = new Schema<IUser>(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
        },
        fullName: {
            type: String,
            trim: true,
        },
        password: {
            type: String,
            required: true,
        },
        role: {
            type: String,
            enum: ['super_admin', 'admin', 'content_manager', 'user', 'teacher'],
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        mustChangePassword: {
            type: Boolean,
            default: false,
        },
        lastPasswordChange: {
            type: Date,
        },
        testCategory: {
            type: Schema.Types.ObjectId,
            ref: 'TestCategory',
        },
        credits: {
            type: Number,
            default: 0,
            min: 0,
        },
        modules: {
            practiceModule: { type: Boolean, default: false },
            teacherAssessments: { type: Boolean, default: false },
        },
        emailVerified: {
            type: Boolean,
            default: false,
        },
        emailVerificationToken: {
            type: String,
        },
        emailVerificationExpires: {
            type: Date,
        },
        passwordResetToken: {
            type: String,
        },
        passwordResetExpires: {
            type: Date,
        },
        passwordResetCount: {
            type: Number,
            default: 0,
        },
        passwordResetLastRequest: {
            type: Date,
        },
        registrationSource: {
            type: String,
            enum: ['self_student', 'teacher_self', 'teacher_invite', 'admin_created'],
        },
        unverifiedAccountExpiresAt: {
            type: Date,
        },
        lastLogin: {
            type: Date,
        },
        profileImage: {
            type: String,
        },
        professionalTitle: {
            type: String,
            trim: true,
        },
        organization: {
            type: String,
            trim: true,
        },
        subjects: {
            type: String,
            trim: true,
        },
        bio: {
            type: String,
            trim: true,
            maxlength: 200,
        },
    },
    {
        timestamps: true,
    }
);

// Sparse unique index on email — allows multiple null values
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ role: 1, emailVerified: 1, unverifiedAccountExpiresAt: 1 });

UserSchema.pre('validate', function normalizeEmailIdentity(next) {
    if (this.email) this.email = normalizeEmailAddress(this.email);
    if ((this.role === 'user' || this.role === 'teacher') && this.username?.includes('@')) {
        this.username = normalizeEmailAddress(this.username);
    } else if (this.username) {
        this.username = String(this.username).trim();
    }
    next();
});

export const User = mongoose.model<IUser>('User', UserSchema);
