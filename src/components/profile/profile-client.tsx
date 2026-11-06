"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Person } from "@/lib/directory/types";
import { MONTHS } from "@/lib/profiles/months";
import { Avatar } from "@/components/profile/avatar";
import { prepareSquareImage, uploadImage } from "@/lib/image-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useSession } from "@/lib/auth/client";
import { MySkills } from "@/components/skills/person-skills";
import { AppSettings } from "@/components/notifications/app-settings";
import { AddAsAppSection } from "@/components/notifications/add-as-app";
import { Loading, ErrorCard } from "@/components/ui/status";
import { Select } from "@/components/ui/select";

function splitBirthday(value: string | null) {
  const match = value?.match(/^([A-Za-z]+) (\d{1,2})$/);
  return match ? { month: match[1], day: match[2] } : { month: "", day: "" };
}

interface FormState {
  unit: string;
  role: string;
  resident: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  landline: string;
  month: string;
  day: string;
  bio: string;
}

function toForm(profile: Person): FormState {
  const { month, day } = splitBirthday(profile.birthday);
  return {
    unit: String(profile.unit),
    role: profile.role,
    resident: profile.resident !== false,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    landline: profile.landline ?? "",
    month,
    day,
    bio: profile.bio ?? "",
  };
}

const digits = (value: string) => value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

/**
 * Edit a directory entry: your own by default, or — for admins — any
 * resident's, when given their person id.
 */
export function ProfileClient({ personId }: { personId?: string } = {}) {
  const { toast } = useToast();
  const { user } = useSession();
  // The Board Secretary and admins manage the directory: unit, role, and phone resets without the current number.
  const isManager = !!user?.canManageDirectory;
  const own = !personId || personId === user?.personId;
  const base = own ? "/api/profiles/me" : `/api/profiles/${personId}`;
  const queryKey = ["profile", own ? "me" : personId];
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => apiFetch<{ profile: Person }>(base),
  });
  const profile = data?.profile;

  useEffect(() => {
    if (profile && !form) setForm(toForm(profile));
  }, [profile, form]);

  const refreshEverywhere = () => {
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    queryClient.invalidateQueries({ queryKey: ["auth"] });
    queryClient.invalidateQueries({ queryKey: ["directory"] });
  };

  const save = useMutation({
    mutationFn: (body: Record<string, string | boolean>) =>
      apiFetch<{ profile: Person }>(base, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (response) => {
      queryClient.setQueryData(queryKey, response);
      setForm(toForm(response.profile));
      refreshEverywhere();
      toast({ title: "Profile saved" });
    },
    onError: (err: Error) =>
      toast({ title: "Could not save profile", description: err.message, variant: "destructive" }),
  });

  const upload = useMutation({
    mutationFn: async (file: File) =>
      uploadImage(`${base}/photo`, await prepareSquareImage(file, 400, "image/jpeg")),
    onSuccess: () => {
      refreshEverywhere();
      toast({ title: "Photo updated" });
    },
    onError: (err: Error) =>
      toast({ title: "Could not upload photo", description: err.message, variant: "destructive" }),
  });

  const removePhoto = useMutation({
    mutationFn: () => apiFetch(`${base}/photo`, { method: "DELETE" }),
    onSuccess: refreshEverywhere,
    onError: (err: Error) =>
      toast({ title: "Could not remove photo", description: err.message, variant: "destructive" }),
  });

  if (isLoading || (profile && !form))
    return <Loading>Loading {own ? "your profile" : "profile"}…</Loading>;
  if (error || !profile || !form) {
    return <ErrorCard error={error} fallback="Your profile is unavailable." />;
  }

  const phonesChanged =
    digits(form.phone) !== digits(profile.phone ?? "") ||
    digits(form.landline) !== digits(profile.landline ?? "");
  const set =
    (key: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((current) => (current ? { ...current, [key]: event.target.value } : current));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const body: Record<string, string | boolean> = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      birthday: form.month && form.day ? `${form.month} ${form.day}` : "",
      bio: form.bio,
    };
    if (phonesChanged) {
      body.phone = form.phone;
      body.landline = form.landline;
    }
    if (isManager) {
      body.unit = form.unit;
      body.role = form.role;
      body.resident = form.resident;
    }
    save.mutate(body);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {own ? "Your profile" : `Edit ${profile.displayName}`}
        </h1>
      </div>

      <Card className="flex flex-col items-center gap-4 sm:flex-row">
        <Avatar name={profile.displayName} photoUrl={profile.photoUrl} size={96} />
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <p className="text-lg font-semibold text-foreground">{profile.displayName}</p>
          <p className="text-sm text-muted">
            Unit {profile.unit}
            {profile.role !== "household"
              ? ` · ${profile.role[0].toUpperCase()}${profile.role.slice(1)}`
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload.mutate(file);
                event.target.value = "";
              }}
            />
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => fileInput.current?.click()}
              disabled={upload.isPending}
            >
              <Camera className="h-4 w-4" />
              {upload.isPending ? "Uploading…" : profile.photoUrl ? "Change photo" : "Add a photo"}
            </Button>
            {profile.photoUrl ? (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted"
                onClick={() => removePhoto.mutate()}
                disabled={removePhoto.isPending}
              >
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          {isManager ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
                Unit
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={form.unit}
                  onChange={set("unit")}
                  className="bg-white"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
                Role
                <Select value={form.role} onChange={set("role")}>
                  <option value="owner">Owner</option>
                  <option value="renter">Renter</option>
                  <option value="household">Household member</option>
                </Select>
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.resident}
                  onChange={(event) => setForm({ ...form, resident: event.target.checked })}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                Lives on site
                <span className="font-normal text-muted">
                  — untick for family or friends who live elsewhere
                </span>
              </label>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              First name
              <Input
                value={form.firstName}
                maxLength={50}
                onChange={set("firstName")}
                className="bg-white"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              Last name
              <Input
                value={form.lastName}
                maxLength={50}
                onChange={set("lastName")}
                className="bg-white"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Email
            <Input
              type="email"
              value={form.email}
              maxLength={254}
              onChange={set("email")}
              className="bg-white"
            />
            <span className="text-xs font-normal text-muted">
              {own ? "Sign-in links are sent here." : "Their sign-in links are sent here."}
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              Mobile phone
              <Input
                type="tel"
                inputMode="tel"
                value={form.phone}
                maxLength={40}
                onChange={set("phone")}
                className="bg-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              Landline
              <Input
                type="tel"
                inputMode="tel"
                value={form.landline}
                maxLength={40}
                onChange={set("landline")}
                className="bg-white"
              />
            </label>
          </div>
          <fieldset className="flex flex-col gap-1 text-sm font-medium text-foreground">
            <legend className="mb-1">Birthday</legend>
            <div className="flex gap-2">
              <Select value={form.month} onChange={set("month")} aria-label="Birthday month">
                <option value="">Month</option>
                {MONTHS.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </Select>
              <Select value={form.day} onChange={set("day")} aria-label="Birthday day">
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </Select>
            </div>
          </fieldset>

          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            {own ? "About you" : "About"}
            <Textarea
              rows={3}
              value={form.bio}
              maxLength={500}
              onChange={set("bio")}
              placeholder="A line or two for your neighbors — interests, how long you've lived here…"
              className="bg-white"
            />
          </label>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending || !form.firstName.trim()}>
              {save.isPending ? "Saving…" : "Save profile"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setForm(toForm(profile))}>
              Reset
            </Button>
          </div>
        </form>
      </Card>

      {own ? <MySkills /> : null}
      {own ? <AddAsAppSection /> : null}
      {own ? <AppSettings /> : null}
    </div>
  );
}
