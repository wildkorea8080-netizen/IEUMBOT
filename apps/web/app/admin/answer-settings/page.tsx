"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AnswerSettingsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/super-admin/answer-settings"); }, [router]);
  return null;
}
