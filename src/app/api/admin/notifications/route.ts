import { NextRequest, NextResponse } from "next/server";
import { adminContext } from "@/lib/auth/admin-http";
import { listUsers } from "@/lib/auth/users";
import { listLastSeen } from "@/lib/auth/last-seen";
import { allPreferences, listSubscriptions } from "@/lib/push/store";
import { DEFAULT_PREFERENCES, TOPICS, type Topic } from "@/lib/push/topics";
import { allEmailPreferences } from "@/lib/email/preferences";
import { readEmailSettings } from "@/lib/email/settings";
import { emailConfigured } from "@/lib/email/send";
import {
  DEFAULT_EMAIL_PREFERENCES,
  PUSH_ONLY_TOPICS,
  emailPreferencesFor,
  isEmailAddress,
} from "@/lib/email/shared";
import { readChanges, readDeliveries } from "@/lib/notifications/store";
import { TOPIC_AUDIENCES } from "@/lib/notifications/shared";

export const dynamic = "force-dynamic";

/**
 * Everything about who's told what, for the admins' Notifications page:
 * the delivery log for the last `days` days (14 by default, up to 400), the
 * opt-in/opt-out log, each resident (and each account with no one in the
 * directory) with their address, account, devices and choices by app and
 * by email, and the rules — each topic's audience and defaults, and how
 * many have it on. Devices are listed by when they were turned on, never by
 * their push addresses.
 */
export async function GET(request: NextRequest) {
  const ctx = await adminContext();
  if ("error" in ctx) return ctx.error;
  const asked = Number(request.nextUrl.searchParams.get("days") ?? 14);
  const days = Number.isFinite(asked) ? Math.min(Math.max(Math.trunc(asked), 1), 400) : 14;
  const [
    deliveries,
    changes,
    users,
    lastSeen,
    appPreferences,
    devices,
    emailPreferences,
    settings,
  ] = await Promise.all([
    readDeliveries(days),
    readChanges(),
    listUsers(),
    listLastSeen(),
    allPreferences(),
    listSubscriptions(),
    allEmailPreferences(),
    readEmailSettings(),
  ]);
  const devicesOf = (userIds: string[]) =>
    devices
      .filter((device) => userIds.includes(device.userId))
      .map((device) => device.createdAt)
      .sort();
  const appChoices = (userIds: string[]) =>
    userIds.length ? { ...DEFAULT_PREFERENCES, ...appPreferences[userIds[0]] } : null;

  const inDirectory = new Set(ctx.directory.people.map((person) => person.id));
  const people = [
    ...ctx.directory.people.map((person) => {
      const accounts = users.filter((user) => user.personId === person.id).map((user) => user.id);
      const email = person.email?.trim() || null;
      return {
        key: person.id,
        name: person.displayName,
        email,
        emailValid: !!email && isEmailAddress(email),
        signedIn: accounts.length > 0,
        lastSeen: lastSeen[person.id] ?? null,
        devices: devicesOf(accounts),
        app: appChoices(accounts),
        appSaved: accounts.length ? appPreferences[accounts[0]] ?? {} : {},
        emailChoices: emailPreferencesFor(emailPreferences[person.id]),
        emailSaved: emailPreferences[person.id] ?? {},
      };
    }),
    ...users
      .filter((user) => !user.personId || !inDirectory.has(user.personId))
      .map((user) => ({
        key: `user:${user.id}`,
        name: user.name,
        email: null,
        emailValid: false,
        signedIn: true,
        lastSeen: null,
        devices: devicesOf([user.id]),
        app: appChoices([user.id]),
        appSaved: appPreferences[user.id] ?? {},
        emailChoices: null,
        emailSaved: {},
      })),
  ];

  const rules = (Object.keys(TOPICS) as Topic[]).map((topic) => ({
    topic,
    label: TOPICS[topic],
    audience: TOPIC_AUDIENCES[topic],
    appDefault: DEFAULT_PREFERENCES[topic],
    emailable: !PUSH_ONLY_TOPICS.includes(topic),
    emailDefault: DEFAULT_EMAIL_PREFERENCES[topic],
    appOn: people.filter((person) => person.app?.[topic]).length,
    signedIn: people.filter((person) => person.app).length,
    emailOn: people.filter((person) => person.emailValid && person.emailChoices?.[topic]).length,
    withAddress: people.filter((person) => person.emailValid).length,
  }));

  return NextResponse.json(
    {
      days,
      deliveries,
      changes,
      people,
      rules,
      email: {
        configured: emailConfigured(),
        testMode: settings.testMode,
        allowed: settings.allowed.length,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
