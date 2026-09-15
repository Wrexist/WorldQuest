/** Backend-neutral wire contracts. Stable application IDs never depend on database IDs. */

export type SessionStorage = {
    getItem: (key: string) => string | null | Promise<string | null>;
    setItem: (key: string, value: string) => void | Promise<void>;
    removeItem: (key: string) => void | Promise<void>;
};
export type SubmitLessonRequest = {
    lessonId: string;
    kind: 'lesson' | 'quest' | 'review' | 'challenge' | 'event';
    topicId?: string;
    startedAt: number;
    answers: readonly unknown[];
    heartsLost?: number;
    clientVersion?: string;
    quest?: {
        date: string;
        tasks: readonly {
            slot: string;
            target: number;
            factIds: readonly string[];
            goal?: string;
        }[];
    };
};
export type SubmitLessonResponse = {
    lessonId: string;
    items: number;
    correct: number;
    accuracy: number;
    xpAwarded: number;
    coinsAwarded: number;
    perfect: boolean;
    rejected: number;
    masteryChanges?: readonly {
        readonly factId: string;
        readonly from: string;
        readonly to: string;
    }[];
    overdueCleared?: number;
    entityMastered?: readonly string[];
    timingDiscarded: boolean;
    streak?: {
        current: number;
        longest: number;
        extended: boolean;
        freezeUsed: boolean;
        reset: boolean;
    };
    quest?: {
        xp: number;
        coins: number;
        slotsPaid: readonly string[];
        bonusPaid: boolean;
    };
    achievements?: {
        xp: number;
        coins: number;
        unlocked: readonly {
            achievementId: string;
            tier: string;
        }[];
    };
    regionsStarted?: readonly string[];
    replayed: boolean;
};
export type Progress = {
    readonly xpTotal: number;
    readonly coins: number;
    readonly hearts: number;
    readonly streak: number;
    readonly longestStreak: number;
    readonly factsMastered: number;
    readonly lastActiveDate: string | null;
    readonly freezesHeld: number;
    readonly brokenOn: string | null;
    readonly lastRepairAt: number | null;
};
export type SubscriptionRow = {
    readonly status: 'none' | 'trialing' | 'active' | 'in_grace' | 'on_hold' | 'expired';
    readonly tier: 'free' | 'premium' | 'family';
    readonly expiresAt: number | null;
    readonly willRenew: boolean;
    readonly hasUsedTrial: boolean;
};
export type FreezePurchase = {
    readonly status: 'purchased';
    readonly freezesHeld: number;
    readonly coins: number;
} | {
    readonly status: 'at_cap';
    readonly freezesHeld: number;
} | {
    readonly status: 'insufficient_funds' | 'not_for_sale' | 'no_streak' | 'unauthorized';
};
export type StreakRepair = {
    readonly status: 'repaired';
    readonly spent: number;
    readonly current: number;
    readonly coins: number;
} | {
    readonly status: 'cooldown';
    readonly availableInDays: number;
} | {
    readonly status: 'insufficient_funds' | 'not_for_sale' | 'no_streak' | 'not_broken' | 'nothing_to_restore' | 'window_expired' | 'unauthorized';
};
export type ContinuePurchase = {
    readonly status: 'purchased';
    readonly spent: number;
    readonly coins: number;
} | {
    readonly status: 'already_paid';
    readonly coins: number;
} | {
    readonly status: 'insufficient_funds' | 'not_for_sale' | 'unauthorized';
};
export type LeagueRow = {
    readonly handle: string;
    readonly weeklyXp: number;
    readonly isYou: boolean;
};
export type LeagueCohort = {
    readonly weekId: string;
    readonly tier: string;
    readonly division: number;
    readonly members: readonly LeagueRow[];
};