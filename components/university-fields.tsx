"use client";

import { useState } from "react";

const faculties: Record<string, string[]> = {
  "早稲田大学": [
    "政治経済学部",
    "法学部",
    "文化構想学部",
    "文学部",
    "教育学部",
    "商学部",
    "基幹理工学部",
    "創造理工学部",
    "先進理工学部",
    "社会科学部",
    "人間科学部",
    "スポーツ科学部",
    "国際教養学部",
  ],
  "日本女子大学": [
    "家政学部",
    "文学部",
    "人間社会学部",
    "理学部",
    "国際文化学部",
    "建築デザイン学部",
    "食科学部",
  ],
  "東京女子大学": [
    "現代教養学部",
  ],
};

export function UniversityFields() {
  const [university, setUniversity] = useState("");

  return <>
    <label>大学
      <select
        name="university"
        value={university}
        onChange={(event) => setUniversity(event.target.value)}
        required
      >
        <option value="">選択してください</option>
        {Object.keys(faculties).map((name) => <option key={name}>{name}</option>)}
      </select>
    </label>
    <label>学部
      <select name="faculty" key={university} disabled={!university} required>
        <option value="">{university ? "選択してください" : "先に大学を選択してください"}</option>
        {(faculties[university] ?? []).map((faculty) => <option key={faculty}>{faculty}</option>)}
      </select>
    </label>
  </>;
}
