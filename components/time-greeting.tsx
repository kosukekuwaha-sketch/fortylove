"use client";

import { useEffect, useState } from "react";

function greetingFor(hour: number) {
  if (hour >= 5 && hour < 11) return "おはようございます";
  if (hour >= 11 && hour < 17) return "こんにちは";
  if (hour >= 17 && hour < 23) return "こんばんは";
  return "おやすみなさい";
}

export function TimeGreeting() {
  const [greeting, setGreeting] = useState("こんにちは");

  useEffect(() => {
    const update = () => setGreeting(greetingFor(new Date().getHours()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return <h2>{greeting}</h2>;
}
