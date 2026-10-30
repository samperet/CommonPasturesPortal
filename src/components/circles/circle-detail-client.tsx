"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackLink } from "@/components/layout/back-link";
import { FileText, LayoutGrid, Loader2, Pencil, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { Circle, CircleApplication, CircleSeat, JoinPolicy } from "@/lib/circles/types";
import { CircleIcon } from "@/components/circles/circle-icon";
import { IconControls, useIconDrawing } from "@/components/circles/icon-controls";
import { DutyScheduleModule, useCircleSchedule } from "@/components/circles/duty-schedule";
import {
  CircleModules,
  ModuleEditor,
  ModuleToggle,
  type ModuleViews,
} from "@/components/circles/circle-modules";
import {
  AddModuleDialog,
  InformationSettings,
  MODULE_ICONS,
  TasksSettings,
  LogSettings,
  TextSettings,
  TaskButtonSettings,
  describeTaskButton,
  describeForum,
  describeText,
  describeLog,
  describeFilter,
  describeFinances,
  describeTasks,
} from "@/components/circles/module-dialogs";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { FinancesModule } from "@/components/finances/finances-module";
import { FinancesSettings } from "@/components/finances/finances-settings";
import { todayInVermont } from "@/lib/time";
import { InformationModule } from "@/components/circles/information-module";
import { ForumModule } from "@/components/groups/forum-module";
import { AlertModule } from "@/components/alerts/alert-module";
import { LogModule } from "@/components/circles/log-module";
import { TextModule } from "@/components/circles/text-module";
import { TasksModule } from "@/components/tasks/task-board";
import { TaskButtonModule } from "@/components/tasks/task-button";
import { INFO_SORT_LABELS, type CircleModule, moduleTitle, modulesFor } from "@/lib/circles/layout";
import { NameCombobox, NameOption } from "@/components/auth/name-combobox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BOARD_ID, isCommunity, sitsOnBoard, isSafetyCrew } from "@/lib/circles/ids";
import { circlePath, managesCircle, parentOf, subgroupsOf } from "@/lib/circles/tiers";
import { SubgroupsModule } from "@/components/circles/subgroups-module";
import Link from "next/link";
import { useDirectoryQuery } from "@/components/directory/use-directory";
import { SectionHeading } from "@/components/ui/section-heading";
import { Pill } from "@/components/ui/pill";
import { Loading, NotFoundCard } from "@/components/ui/status";
import { useConfirm } from "@/components/ui/confirm";
import { useCircleMutation } from "@/components/circles/use-circle-mutation";
import {
  DetailsFields,
  detailsDraftOf,
  type DetailsDraft,
} from "@/components/circles/details-editor";
import { MembersModule, ROLES } from "@/components/circles/members-module";

export function CircleDetailClient({ id }: { id: string }) {
  const confirm = useConfirm();
  const router = useRouter();
  const { user } = useSession();
  const { data, isLoading, error } = useDirectoryQuery();
  const drawingIcon = useIconDrawing(id);

  const circle = data?.circles.find((entry) => entry.id === id);
  const people = useMemo(
    () => new Map((data?.people ?? []).map((person) => [person.id, person])),
    [data]
  );
  const inCircle = (circleId: string) =>
    !!user?.personId &&
    !!data?.circles.some(
      (c) => c.id === circleId && c.seats.some((seat) => seat.personId === user.personId)
    );
  // Admins can manage every circle, as the Board can; a sub group's circle's members manage it too.
  const onBoard = sitsOnBoard(data?.circles ?? [], user?.personId) || !!user?.isAdmin;
  const isMember = inCircle(id);
  const canManage = !!user?.isAdmin || managesCircle(data?.circles ?? [], id, user?.personId);
  const parent = circle && data ? parentOf(data.circles, circle) : null;
  const subgroups = data ? subgroupsOf(data.circles, id) : [];
  // A sub group is deleted by its circle's members (and the Board); a circle by the Board.
  const canDelete =
    !!circle &&
    circle.id !== BOARD_ID &&
    !isCommunity(id) &&
    (parent
      ? !!user?.isAdmin || managesCircle(data?.circles ?? [], parent.id, user?.personId)
      : onBoard);
  // The Community circle is everyone: no member list, and any resident adds its documents.
  const community = isCommunity(id);
  const canUpload = canManage || (community && !!user?.personId);

  const remove = useCircleMutation(
    () => apiFetch(`/api/circles/${id}`, { method: "DELETE" }),
    "Could not delete circle",
    () => router.replace("/circles")
  );
  const scheduleQuery = useCircleSchedule(id);
  const schedule = scheduleQuery.data?.schedule ?? null;
  // Editing the circle: its details and modules as they're being worked on (null when not
  // editing), saved together — and the dialog open on a module.
  const [pageDraft, setPageDraft] = useState<CircleModule[] | null>(null);
  const [detailsDraft, setDetailsDraft] = useState<DetailsDraft | null>(null);
  const stopEditing = () => {
    setPageDraft(null);
    setDetailsDraft(null);
  };
  const [dialog, setDialog] = useState<
    { kind: "add" } | { kind: "settings"; module: CircleModule } | null
  >(null);
  // The year the Finances module shows, which its Settings start from too.
  const [financeYear, setFinanceYear] = useState(() => todayInVermont().slice(0, 4));
  const saveEdit = useCircleMutation(
    (changes: Record<string, unknown>) =>
      apiFetch(`/api/circles/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
    "Could not save the circle",
    stopEditing
  );

  if (isLoading) return <Loading>Loading circle…</Loading>;
  if (error || !data || !circle) {
    return (
      <NotFoundCard
        error={error}
        message="That circle wasn't found."
        href="/circles"
        label="All circles"
      />
    );
  }

  const members = circle.seats.filter((seat) => seat.personId || seat.name);
  const memberIds = new Set(members.map((seat) => seat.personId));
  const candidates = data.people
    .filter((person) => !memberIds.has(person.id))
    .map((person) => ({ id: person.id, name: person.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // The page's modules, in the order (and sizes) the circle chose.
  const modules = modulesFor(circle, { hasSchedule: !!schedule });
  const circleName = (circleId: string) =>
    data.circles.find((entry) => entry.id === circleId)?.name;
  const icon = (module: CircleModule) => {
    const Icon = MODULE_ICONS[module.type];
    return <Icon className="h-5 w-5 text-primary" aria-hidden />;
  };
  const sectionFor = (module: CircleModule) => {
    const title = moduleTitle(module, schedule?.title);
    switch (module.type) {
      case "information":
        return {
          title,
          icon: icon(module),
          detail: module.info
            ? `${describeFilter(module.info.filter, circleName)}${
                module.info.sort ? ` · ${INFO_SORT_LABELS[module.info.sort].toLowerCase()}` : ""
              }`
            : undefined,
          content: (
            <InformationModule
              circle={circle}
              module={module}
              canAdd={canUpload}
              narrow={module.size === "small"}
            />
          ),
        };
      case "members":
        return community
          ? undefined
          : {
              title,
              icon: icon(module),
              content: (
                <MembersModule
                  circle={circle}
                  people={people}
                  candidates={candidates}
                  canManage={canManage}
                  isMember={isMember}
                />
              ),
            };
      case "schedule":
        return schedule
          ? {
              title,
              icon: icon(module),
              content: <DutyScheduleModule circleId={id} people={people} />,
            }
          : undefined;
      case "tasks":
        return {
          title,
          icon: icon(module),
          detail: describeTasks(module, (personId) => people.get(personId)?.displayName ?? null),
          content: (
            <Card>
              <TasksModule circle={circle} module={module} title={title} />
            </Card>
          ),
        };
      case "forum":
        return {
          title,
          icon: icon(module),
          detail: describeForum(),
          content: (
            <Card className="flex flex-col gap-4">
              <SectionHeading icon={MODULE_ICONS.forum} toggle={<ModuleToggle />}>
                {title}
              </SectionHeading>
              <ForumModule circleId={circle.id} circleName={circle.name} />
            </Card>
          ),
        };
      case "log":
        return {
          title,
          icon: icon(module),
          detail: describeLog(module),
          content: (
            <Card className="flex flex-col gap-4">
              <SectionHeading icon={MODULE_ICONS.log} toggle={<ModuleToggle />}>
                {title}
              </SectionHeading>
              <LogModule circleId={circle.id} />
            </Card>
          ),
        };
      case "finances":
        return {
          title,
          icon: icon(module),
          detail: describeFinances(module),
          content: (
            <FinancesModule
              circle={circle}
              module={module}
              year={financeYear}
              onYear={setFinanceYear}
            />
          ),
        };
      case "text":
        return {
          title,
          icon: icon(module),
          detail: describeText(module),
          content: (
            <TextModule circleId={circle.id} module={module} title={title} canEdit={canManage} />
          ),
        };
      case "taskbutton":
        return {
          title,
          icon: icon(module),
          detail: describeTaskButton(module, data.circles),
          content: <TaskButtonModule circleId={circle.id} module={module} title={title} />,
        };
      case "subgroups":
        return {
          title,
          icon: icon(module),
          content: (
            <SubgroupsModule
              circle={circle}
              circles={data.circles}
              title={title}
              canManage={canManage}
            />
          ),
        };
      case "alert":
        return {
          title,
          icon: icon(module),
          content: <AlertModule circleId={circle.id} circleName={circle.name} title={title} />,
        };
      case "documents":
        return {
          title,
          icon: icon(module),
          content: (
            <Card className="flex flex-col gap-4">
              <SectionHeading icon={FileText} toggle={<ModuleToggle />}>
                {title}
              </SectionHeading>
              <DocumentsPanel circleId={id} circleName={circle.name} canUpload={canUpload} />
            </Card>
          ),
        };
    }
  };
  const sectionsOf = (list: CircleModule[]): ModuleViews =>
    Object.fromEntries(list.map((module) => [module.id, sectionFor(module)]));
  const editing = pageDraft ?? [];
  // A sub group is of its circle's kind.
  const canSetKind = onBoard && circle.id !== BOARD_ID && !community && !parent;
  // Save what changed — details and the page together, in one request.
  const save = () => {
    const changes: Record<string, unknown> = {};
    if (detailsDraft) {
      const before = detailsDraftOf(circle);
      if (detailsDraft.name !== before.name) changes.name = detailsDraft.name;
      if (detailsDraft.description !== before.description)
        changes.description = detailsDraft.description;
      if (canSetKind && detailsDraft.club !== before.club)
        changes.kind = detailsDraft.club ? "club" : "circle";
    }
    if (pageDraft && JSON.stringify(pageDraft) !== JSON.stringify(modules))
      changes.modules = pageDraft;
    if (Object.keys(changes).length) saveEdit.mutate(changes);
    else stopEditing();
  };

  return (
    <div className="flex flex-col gap-6">
      <datalist id="circle-roles">
        {ROLES.map((role) => (
          <option key={role} value={role} />
        ))}
      </datalist>
      {/* Above the circle's header: the way back, and — for those who manage it — Edit, or the editing controls. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {parent ? (
          <BackLink href={`/circles/${parent.id}`} label={parent.name} />
        ) : (
          <BackLink href="/circles" label="All circles" />
        )}
        <div className="flex flex-wrap items-center justify-end gap-2" data-circle-actions>
          {canManage && !pageDraft ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setPageDraft(modules);
                setDetailsDraft(detailsDraftOf(circle));
              }}
              disabled={scheduleQuery.isLoading}
            >
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          ) : null}
          {pageDraft ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <IconControls circle={circle} />
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => setDialog({ kind: "add" })}
              >
                <Plus className="h-4 w-4" /> Add module
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={saveEdit.isPending || (detailsDraft?.name.trim().length ?? 2) < 2}
              >
                {saveEdit.isPending ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={stopEditing}>
                Cancel
              </Button>
              {canDelete ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-muted hover:text-destructive"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Delete ${circle.name}?`,
                        body: `Its documents, pages, and open proposals go to ${
                          parent ? parent.name : "the Board"
                        }, and its finances are kept; its tasks, log, and forum go with it.${
                          subgroups.length
                            ? ` Its sub groups (${subgroups
                                .map((sub) => sub.name)
                                .join(", ")}) become circles of their own.`
                            : ""
                        }`,
                        destructive: true,
                      })
                    )
                      remove.mutate(undefined);
                  }}
                  disabled={remove.isPending}
                >
                  <X className="h-4 w-4" /> {parent ? "Delete sub group" : "Delete circle"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative w-fit shrink-0">
          <CircleIcon circle={circle} size={96} />
          {drawingIcon ? (
            <span
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-white/80 text-xs font-medium text-foreground"
              role="status"
            >
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden /> Drawing…
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {detailsDraft ? (
            <DetailsFields
              value={detailsDraft}
              onChange={setDetailsDraft}
              canSetKind={canSetKind}
            />
          ) : (
            <>
              {/* Where it sits: within Community (every circle is), and within its circle for a sub group. */}
              {!community ? (
                <p
                  className="flex flex-wrap items-center gap-x-1 text-sm text-muted"
                  data-breadcrumb
                >
                  {circlePath(data.circles, circle)
                    .slice(0, -1)
                    .map((above) => (
                      <span key={above.id} className="inline-flex items-center gap-1">
                        <Link href={`/circles/${above.id}`} className="hover:underline">
                          {above.name}
                        </Link>
                        <span aria-hidden>›</span>
                      </span>
                    ))}
                  <span>
                    {parent ? "sub group" : circle.kind === "club" ? "social club" : "circle"}
                  </span>
                </p>
              ) : null}
              <h1 className="text-2xl font-semibold text-foreground">{circle.name}</h1>
              {circle.kind === "club" && !parent ? (
                <Pill className="w-fit">Social club</Pill>
              ) : null}
              {circle.description ? (
                <p className="whitespace-pre-wrap text-sm text-foreground-light">
                  {circle.description}
                </p>
              ) : canManage ? (
                <p className="text-sm text-muted">No description yet.</p>
              ) : null}
            </>
          )}
        </div>
      </Card>

      {pageDraft ? (
        <>
          {editing.length ? (
            <ModuleEditor
              modules={editing}
              sections={sectionsOf(editing)}
              safetyCrew={isSafetyCrew(circle)}
              community={isCommunity(circle.id)}
              onChange={setPageDraft}
              onSettings={(module) => setDialog({ kind: "settings", module })}
            />
          ) : (
            <Card>
              <p className="text-sm text-muted">Nothing on this page yet — add a module.</p>
            </Card>
          )}
          {dialog?.kind === "add" ? (
            <AddModuleDialog
              circle={circle}
              modules={editing}
              hasSchedule={!!schedule}
              onClose={() => setDialog(null)}
              onAdd={(module) => {
                setPageDraft([...editing, module]);
                setDialog(
                  module.type === "information" ||
                    module.type === "text" ||
                    module.type === "taskbutton"
                    ? { kind: "settings", module }
                    : null
                );
              }}
            />
          ) : dialog?.kind === "settings" && dialog.module.type === "text" ? (
            <TextSettings
              module={dialog.module}
              onClose={() => setDialog(null)}
              onSave={(module) => {
                setPageDraft(editing.map((entry) => (entry.id === module.id ? module : entry)));
                setDialog(null);
              }}
            />
          ) : dialog?.kind === "settings" && dialog.module.type === "taskbutton" ? (
            <TaskButtonSettings
              module={dialog.module}
              circle={circle}
              onClose={() => {
                // A button never set up (just added) goes again.
                const unset = !dialog.module.taskButton;
                if (unset) setPageDraft(editing.filter((entry) => entry.id !== dialog.module.id));
                setDialog(null);
              }}
              onSave={(module) => {
                setPageDraft(editing.map((entry) => (entry.id === module.id ? module : entry)));
                setDialog(null);
              }}
            />
          ) : dialog?.kind === "settings" && dialog.module.type === "log" ? (
            <LogSettings
              module={dialog.module}
              onClose={() => setDialog(null)}
              onSave={(module) => {
                setPageDraft(editing.map((entry) => (entry.id === module.id ? module : entry)));
                setDialog(null);
              }}
            />
          ) : dialog?.kind === "settings" && dialog.module.type === "tasks" ? (
            <TasksSettings
              module={dialog.module}
              circle={circle}
              onClose={() => setDialog(null)}
              onSave={(module) => {
                // Who can add tasks is the circle's: every Tasks module says the same.
                const add = module.tasks!.add;
                setPageDraft(
                  editing.map((entry) =>
                    entry.id === module.id
                      ? module
                      : entry.type === "tasks"
                        ? { ...entry, tasks: { ...entry.tasks, add } }
                        : entry
                  )
                );
                setDialog(null);
              }}
            />
          ) : dialog?.kind === "settings" && dialog.module.type === "finances" ? (
            <FinancesSettings
              circle={circle}
              module={dialog.module}
              year={financeYear}
              onClose={() => setDialog(null)}
              onSave={(module) => {
                setPageDraft(editing.map((entry) => (entry.id === module.id ? module : entry)));
                setDialog(null);
              }}
            />
          ) : dialog?.kind === "settings" ? (
            <InformationSettings
              circle={circle}
              module={dialog.module}
              onClose={() => setDialog(null)}
              onSave={(module) => {
                setPageDraft(editing.map((entry) => (entry.id === module.id ? module : entry)));
                setDialog(null);
              }}
            />
          ) : null}
        </>
      ) : (
        <CircleModules circleId={circle.id} modules={modules} sections={sectionsOf(modules)} />
      )}
    </div>
  );
}
