import { useState } from "react";
import {
  Bell,
  CalendarClock,
  ChevronDown,
  MessageSquare,
  Phone,
  StickyNote,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_TYPES,
  addActivity,
  addReminder,
  deleteActivity,
  deleteReminder,
  reminderTone,
  setReminderCompleted,
  timeAgo,
  todayISO,
  useCrmInvalidate,
  useCustomerActivities,
  useCustomerReminders,
  type ActivityType,
} from "@/lib/crm";

const TYPE_ICON: Record<string, typeof StickyNote> = {
  Note: StickyNote,
  Call: Phone,
  Meeting: Users,
  "Follow-up": CalendarClock,
};

export function CustomerActivityPanel({ customerId }: { customerId: string }) {
  const { data: activities = [] } = useCustomerActivities(customerId);
  const invalidate = useCrmInvalidate();
  const [type, setType] = useState<ActivityType>("Note");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!content.trim()) {
      toast.error("Write something first");
      return;
    }
    setSaving(true);
    try {
      await addActivity(customerId, type, content);
      setContent("");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the note");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteActivity(id);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the entry");
    }
  };

  return (
    <div className="space-y-4">
      <div className="surface-card space-y-3 p-4 sm:p-5">
        <Textarea
          rows={3}
          maxLength={2000}
          placeholder="Log a note, call summary or follow-up detail…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Select value={type} onValueChange={(v) => setType(v as ActivityType)}>
            <SelectTrigger className="h-11 sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="h-11" disabled={saving} onClick={submit}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold">Timeline</h3>
        </div>
        {activities.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No activity logged for this customer yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {activities.map((a) => {
              const Icon = TYPE_ICON[a.activity_type] ?? MessageSquare;
              return (
                <li key={a.id} className="flex gap-3 px-4 py-4 sm:px-5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone="accent">{a.activity_type}</StatusBadge>
                      <span className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm">{a.content}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete entry"
                    className="shrink-0 self-start rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                    onClick={() => remove(a.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function CustomerRemindersPanel({ customerId }: { customerId: string }) {
  const { data: reminders = [] } = useCustomerReminders(customerId);
  const invalidate = useCrmInvalidate();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(todayISO());
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const open = reminders.filter((r) => !r.is_completed);
  const done = reminders.filter((r) => r.is_completed);

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Give the reminder a title");
      return;
    }
    setSaving(true);
    try {
      await addReminder(customerId, title, dueDate);
      setTitle("");
      setDueDate(todayISO());
      setAdding(false);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the reminder");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: string, completed: boolean) => {
    try {
      await setReminderCompleted(id, completed);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the reminder");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteReminder(id);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the reminder");
    }
  };

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Reminders</h3>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "New Reminder"}
        </Button>
      </div>

      {adding && (
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end sm:px-5">
          <div className="space-y-2">
            <Label htmlFor="rem-title">Title</Label>
            <Input
              id="rem-title"
              className="h-11"
              maxLength={200}
              placeholder="e.g. Call back about Rasasi order"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rem-date">Due date</Label>
            <Input
              id="rem-date"
              type="date"
              className="h-11"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <Button className="h-11" disabled={saving} onClick={submit}>
            {saving ? "Saving…" : "Add"}
          </Button>
        </div>
      )}

      {open.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No open reminders.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {open.map((r) => {
            const tone = reminderTone(r.due_date);
            return (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <Checkbox
                  className="mt-1"
                  checked={false}
                  aria-label={`Mark "${r.title}" complete`}
                  onCheckedChange={() => toggle(r.id, true)}
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">{r.title}</p>
                  <p
                    className={cn(
                      "mt-0.5 text-xs",
                      tone === "error" && "font-semibold text-destructive",
                      tone === "warning" && "font-semibold text-warning-foreground",
                      tone === "neutral" && "text-muted-foreground",
                    )}
                  >
                    {tone === "error" ? "Overdue · " : tone === "warning" ? "Due today · " : "Due "}
                    {formatDate(r.due_date)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Delete reminder"
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => remove(r.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {done.length > 0 && (
        <Collapsible open={showDone} onOpenChange={setShowDone} className="border-t border-border">
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 sm:px-5">
            <ChevronDown className={cn("h-4 w-4 transition-transform", showDone && "rotate-180")} />
            Show completed ({done.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="divide-y divide-border/60 border-t border-border">
              {done.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <Checkbox
                    className="mt-1"
                    checked
                    aria-label={`Reopen "${r.title}"`}
                    onCheckedChange={() => toggle(r.id, false)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm text-muted-foreground line-through">
                      {r.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Completed {timeAgo(r.completed_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
