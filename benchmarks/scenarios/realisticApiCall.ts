import { faker } from '@faker-js/faker';
import type { Scenario } from '../measure.ts';

export function realisticApiCallScenario(): Scenario {
    return {
        id: 'realistic-api-call',
        name: 'Realistic API Call',
        description: 'A batch of realistic API call objects with embedded customers, Dates, and undefined values.',
        iterations: 100,
        batches: 5,
        getData: createRealisticApiCalls,
        // Too slow.
        skipSerializers: [ 'next-json' ],
    };
}

export type RealisticApiCall = {
    generatedAt: Date;
    tenant: {
        id: string;
        name: string;
        plan: string;
        region: string;
        contractStartedAt: Date;
        contractRenewalAt: Date | undefined;
    };
    dashboard: {
        activeUsers: number;
        openInvoices: number;
        conversionRateBps: number;
        lastRefreshedAt: Date;
        nextRefreshAt: Date | undefined;
        alerts: {
            id: string;
            severity: 'info' | 'warning' | 'critical';
            message: string;
            createdAt: Date;
            acknowledgedAt: Date | undefined;
            metadata: AlertMetadata | undefined;
        }[];
    };
    activePromotion: Promotion | undefined;
    customers: Customer[];
    orders: Order[];
};

function createRealisticApiCalls(): RealisticApiCall[] {
    return Array.from({ length: 100 }, createRealisticApiCall);
}

export function createRealisticApiCall(): RealisticApiCall {
    const customerCount = faker.number.int({ min: 10, max: 20 });
    const customers = Array.from({ length: customerCount }, createCustomer);
    const orderCount = faker.number.int({ min: 2, max: 4 });

    return {
        ...createApiCommon(),
        customers,
        orders: Array.from({ length: orderCount }, () => createOrder(customers)),
    };
}

type Promotion = {
    code: string;
    discountBps: number;
    expiresAt: Date;
};

function createApiCommon(): Omit<RealisticApiCall, 'customers' | 'orders'> {
    const now = faker.date.recent({ days: 1 });

    return {
        generatedAt: faker.date.recent({ days: 5 }),
        tenant: {
            id: faker.string.uuid(),
            name: faker.company.name(),
            plan: faker.helpers.arrayElement([ 'starter', 'growth', 'enterprise' ]),
            region: faker.helpers.arrayElement([ 'eu-central', 'us-east', 'ap-southeast' ]),
            contractStartedAt: faker.date.past({ years: 4 }),
            contractRenewalAt: maybeDateSoon(60, now),
        },
        dashboard: {
            activeUsers: faker.number.int({ min: 700, max: 8000 }),
            openInvoices: faker.number.int({ min: 20, max: 600 }),
            conversionRateBps: faker.number.int({ min: 80, max: 1250 }),
            lastRefreshedAt: now,
            nextRefreshAt: faker.datatype.boolean({ probability: 0.2 })
                ? undefined
                : faker.date.soon({ days: 1, refDate: now }),
            alerts: Array.from({ length: 18 }, createAlert),
        },
        activePromotion: faker.datatype.boolean({ probability: 0.5 })
            ? undefined
            : {
                code: faker.string.alphanumeric({ length: 8, casing: 'upper' }),
                discountBps: faker.number.int({ min: 250, max: 2500 }),
                expiresAt: faker.date.soon({ days: 14 }),
            },
    };
}

type Customer = {
    id: string;
    email: string;
    fullName: string;
    company: string;
    phone: string;
    loyaltyTier: 'bronze' | 'silver' | 'gold';
    marketingOptIn: boolean;
    tags: string[];
    createdAt: Date;
    lastSeenAt: Date | undefined;
    archivedAt: Date | undefined;
    profileOverrides: {
        preferredLanguage: string;
        timezone: string;
    } | undefined;
    addresses: Address[];
};

function createCustomer(): Customer {
    const createdAt = faker.date.past({ years: 3 });

    return {
        id: faker.string.uuid(),
        email: faker.internet.email().toLowerCase(),
        fullName: faker.person.fullName(),
        company: faker.company.name(),
        phone: faker.phone.number(),
        loyaltyTier: faker.helpers.arrayElement([ 'bronze', 'silver', 'gold' ] as const),
        marketingOptIn: faker.datatype.boolean(),
        tags: faker.helpers.multiple(
            () => faker.helpers.arrayElement([ 'beta', 'priority', 'newsletter', 'partner', 'vip' ]),
            { count: 3 },
        ),
        createdAt,
        lastSeenAt: maybeDateSoon(30),
        archivedAt: faker.datatype.boolean({ probability: 0.08 })
            ? faker.date.recent({ days: 120 })
            : undefined,
        profileOverrides: faker.datatype.boolean({ probability: 0.35 })
            ? {
                preferredLanguage: faker.helpers.arrayElement([ 'en-US', 'es-ES', 'fr-FR', 'de-DE' ]),
                timezone: faker.location.timeZone(),
            }
            : undefined,
        addresses: [
            createAddress('billing'),
            createAddress('shipping'),
        ],
    };
}

type Address = {
    type: 'billing' | 'shipping';
    line1: string;
    city: string;
    country: string;
    postalCode: string;
    verifiedAt: Date | undefined;
};

function createAddress(type: 'billing' | 'shipping'): Address {
    return {
        type,
        line1: faker.location.streetAddress(),
        city: faker.location.city(),
        country: faker.location.countryCode('alpha-2'),
        postalCode: faker.location.zipCode(),
        verifiedAt: maybeDateSoon(365),
    };
}

type AlertMetadata = {
    source: string;
    ticketId: string;
};

function createAlert() {
    const createdAt = faker.date.recent({ days: 3 });

    return {
        id: faker.string.uuid(),
        severity: faker.helpers.arrayElement([ 'info', 'warning', 'critical' ] as const),
        message: faker.helpers.arrayElement([
            'Payment gateway latency increased',
            'Inventory sync delayed',
            'Bulk export completed',
            'A new admin signed in',
        ]),
        createdAt,
        acknowledgedAt: faker.datatype.boolean({ probability: 0.6 })
            ? faker.date.between({ from: createdAt, to: faker.defaultRefDate() })
            : undefined,
        metadata: faker.datatype.boolean({ probability: 0.5 })
            ? {
                source: faker.helpers.arrayElement([ 'billing', 'fulfillment', 'identity', 'analytics' ]),
                ticketId: faker.string.alphanumeric({ casing: 'upper', length: 10 }),
            }
            : undefined,
    };
}

type Order = {
    id: string;
    customer: Customer;
    status: 'pending' | 'paid' | 'fulfilled' | 'refunded';
    currency: string;
    createdAt: Date;
    paidAt: Date | undefined;
    fulfilledAt: Date | undefined;
    refundedAt: Date | undefined;
    items: OrderItem[];
    totals: {
        subtotalCents: number;
        taxCents: number;
        shippingCents: number;
        grandTotalCents: number;
    };
};

function createOrder(customers: RealisticApiCall['customers']): Order {
    const customer = faker.helpers.arrayElement(customers);
    const items = Array.from({ length: faker.number.int({ min: 2, max: 6 }) }, createOrderItem);
    const subtotalCents = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
    const taxCents = Math.round(subtotalCents * 0.21);
    const shippingCents = faker.number.int({ min: 300, max: 2000 });
    const createdAt = faker.date.recent({ days: 30 });

    return {
        id: faker.string.uuid(),
        customer,
        status: faker.helpers.arrayElement([ 'pending', 'paid', 'fulfilled', 'refunded' ] as const),
        currency: 'USD',
        createdAt,
        paidAt: maybeDateSoon(10, createdAt),
        fulfilledAt: maybeDateSoon(20, createdAt),
        refundedAt: faker.datatype.boolean({ probability: 0.12 })
            ? faker.date.soon({ days: 35, refDate: createdAt })
            : undefined,
        items,
        totals: {
            subtotalCents,
            taxCents,
            shippingCents,
            grandTotalCents: subtotalCents + taxCents + shippingCents,
        },
    };
}

type OrderItem = {
    sku: string;
    quantity: number;
    unitPriceCents: number;
    title: string;
    category: string;
    discountedUntil: Date | undefined;
};

function createOrderItem(): OrderItem {
    return {
        sku: faker.string.alphanumeric({ casing: 'upper', length: 10 }),
        quantity: faker.number.int({ min: 1, max: 5 }),
        unitPriceCents: faker.number.int({ min: 500, max: 90000 }),
        title: faker.commerce.productName(),
        category: faker.commerce.department(),
        discountedUntil: faker.datatype.boolean({ probability: 0.25 })
            ? faker.date.soon({ days: 7 })
            : undefined,
    };
}

function maybeDateSoon(days: number, refDate?: Date): Date | undefined {
    if (faker.datatype.boolean({ probability: 0.45 }))
        return undefined;

    return faker.date.soon({ days, refDate });
}
