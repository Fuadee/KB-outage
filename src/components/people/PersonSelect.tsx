"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { ResponsibleUnit } from "@/lib/jobMetadata";
import type { PersonReference } from "@/lib/people";
import { inputLight } from "@/lib/theme";
import { cn } from "@/lib/utils";

type PersonSelectProps = {
  department: ResponsibleUnit | "";
  value: string | null;
  onChange: (person: PersonReference | null) => void;
  selectedPerson?: PersonReference | null;
  legacyName?: string | null;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
};

export default function PersonSelect({
  department,
  value,
  onChange,
  selectedPerson = null,
  legacyName = null,
  disabled = false,
  required = false,
  placeholder = "ค้นหาและเลือกบุคลากร"
}: PersonSelectProps) {
  const listboxId = useId();
  const [people, setPeople] = useState<PersonReference[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!department) {
      setPeople([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const loadPeople = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          active: "true",
          department
        });
        const response = await fetch(`/api/people?${params.toString()}`, {
          signal: controller.signal
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok) {
          throw new Error(result?.error ?? "โหลดรายชื่อบุคลากรไม่สำเร็จ");
        }
        setPeople(result.data ?? []);
      } catch (error) {
        if (!controller.signal.aborted) setPeople([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadPeople();
    return () => controller.abort();
  }, [department]);

  const selected = useMemo(
    () =>
      people.find((person) => person.id === value) ??
      (selectedPerson?.id === value ? selectedPerson : null),
    [people, selectedPerson, value]
  );
  const displayValue = open
    ? query
    : selected?.full_name ?? (!value ? legacyName ?? "" : "");
  const normalizedQuery = query.trim().toLocaleLowerCase("th-TH");
  const options = people.filter((person) =>
    normalizedQuery
      ? person.full_name.toLocaleLowerCase("th-TH").includes(normalizedQuery)
      : true
  );
  const isDisabled = disabled || !department;

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open && !isDisabled}
        value={displayValue}
        disabled={isDisabled}
        required={required}
        placeholder={!department ? "กรุณาเลือกหน่วยงานก่อน" : placeholder}
        className={cn(inputLight, "w-full")}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange(null);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
      />
      {open && !isDisabled ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          {loading ? (
            <p className="px-3 py-2 text-sm text-slate-500">กำลังโหลด...</p>
          ) : options.length ? (
            options.map((person) => (
              <button
                key={person.id}
                type="button"
                role="option"
                aria-selected={person.id === value}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(person);
                  setQuery(person.full_name);
                  setOpen(false);
                }}
              >
                {person.full_name}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-slate-500">
              ไม่พบบุคลากรที่ใช้งานอยู่
            </p>
          )}
        </div>
      ) : null}
      {!value && legacyName ? (
        <p className="mt-1 text-xs font-normal text-slate-500">
          ข้อมูลเดิม: {legacyName}
        </p>
      ) : null}
      {selected && !selected.is_active ? (
        <p className="mt-1 text-xs font-normal text-amber-700">
          บุคลากรนี้ปิดใช้งานแล้ว แต่ยังคงแสดงสำหรับข้อมูลเดิม
        </p>
      ) : null}
    </div>
  );
}
