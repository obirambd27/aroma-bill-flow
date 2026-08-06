import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CustomerTag = Tables<"customer_tags">;
export type CustomerActivity = Tables<"customer_activities">;
export type CustomerReminder = Tables<"customer_reminders">;

export const ACTIVITY_TYPES = ["Note", "Call", "Meeting", "Follow-up"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const TAG_COLORS = ["plum", "amber", "emerald", "slate", "rose", "sky"] as const;

const TAG_CLASS: Record<string, string> = {
  plum: "bg-primary/10 text-primary border-primary/25",
  amber: "bg-warning/15 text-warning-foreground border-warning/35",
  emerald: "bg-success/12 text-success border-success/25",
  slate: "bg-muted text-muted-foreground border-border",
  rose: "bg-destructive/10 text-destructive border-destructive/25",
  sky: "bg-accent text-accent-foreground border-accent-foreground/15",
};

export function tagClass(color: string | null | undefined) {
  return TAG_CLASS[color ?? "slate"] ?? TAG_CLASS["slate"]!;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** "2 days ago" style relative time. */
export function timeAgo(value: string | null | undefined) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function useCustomerTags() {
  return useQuery({
    queryKey: ["customer-tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_tags").select("*").order("name");
      if (error) throw error;
      return data as CustomerTag[];
    },
  });
}

export type TagAssignment = {
  id: string;
  customer_id: string;
  tag_id: string;
  customer_tags: CustomerTag | null;
};

/** All tag assignments, grouped by customer id. */
export function useTagAssignments() {
  return useQuery({
    queryKey: ["customer-tag-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_tag_assignments")
        .select("id, customer_id, tag_id, customer_tags(*)");
      if (error) throw error;
      const rows = (data ?? []) as unknown as TagAssignment[];
      const byCustomer: Record<string, TagAssignment[]> = {};
      for (const row of rows) {
        (byCustomer[row.customer_id] ??= []).push(row);
      }
      for (const list of Object.values(byCustomer)) {
        list.sort((a, b) => (a.customer_tags?.name ?? "").localeCompare(b.customer_tags?.name ?? ""));
      }
      return byCustomer;
    },
  });
}

export function useCustomerActivities(customerId: string) {
  return useQuery({
    queryKey: ["customer-activities", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_activities")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CustomerActivity[];
    },
  });
}

export function useCustomerReminders(customerId: string) {
  return useQuery({
    queryKey: ["customer-reminders", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_reminders")
        .select("*")
        .eq("customer_id", customerId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data as CustomerReminder[];
    },
  });
}

export type DueReminder = CustomerReminder & { customers: { id: string; name: string } | null };

/** Open reminders across all customers that are due today or overdue. */
export function useDueReminders() {
  return useQuery({
    queryKey: ["reminders-due"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_reminders")
        .select("*, customers(id, name)")
        .eq("is_completed", false)
        .lte("due_date", todayISO())
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as DueReminder[];
    },
  });
}

export function useCrmInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["customer-tags"] });
    queryClient.invalidateQueries({ queryKey: ["customer-tag-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["customer-activities"] });
    queryClient.invalidateQueries({ queryKey: ["customer-reminders"] });
    queryClient.invalidateQueries({ queryKey: ["reminders-due"] });
  };
}

export async function createTag(name: string, color?: string) {
  const { data, error } = await supabase
    .from("customer_tags")
    .insert({ name: name.trim(), color: color ?? "slate" })
    .select()
    .single();
  if (error) throw error;
  return data as CustomerTag;
}

export async function assignTag(customerId: string, tagId: string) {
  const { error } = await supabase
    .from("customer_tag_assignments")
    .insert({ customer_id: customerId, tag_id: tagId });
  if (error && error.code !== "23505") throw error;
}

export async function unassignTag(assignmentId: string) {
  const { error } = await supabase.from("customer_tag_assignments").delete().eq("id", assignmentId);
  if (error) throw error;
}

export async function addActivity(customerId: string, type: ActivityType, content: string) {
  const { error } = await supabase
    .from("customer_activities")
    .insert({ customer_id: customerId, activity_type: type, content: content.trim() });
  if (error) throw error;
}

export async function deleteActivity(id: string) {
  const { error } = await supabase.from("customer_activities").delete().eq("id", id);
  if (error) throw error;
}

export async function addReminder(customerId: string, title: string, dueDate: string) {
  const { error } = await supabase
    .from("customer_reminders")
    .insert({ customer_id: customerId, title: title.trim(), due_date: dueDate });
  if (error) throw error;
}

export async function setReminderCompleted(id: string, completed: boolean) {
  const { error } = await supabase
    .from("customer_reminders")
    .update({ is_completed: completed, completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteReminder(id: string) {
  const { error } = await supabase.from("customer_reminders").delete().eq("id", id);
  if (error) throw error;
}

export function reminderTone(dueDate: string): "error" | "warning" | "neutral" {
  const today = todayISO();
  if (dueDate < today) return "error";
  if (dueDate === today) return "warning";
  return "neutral";
}
