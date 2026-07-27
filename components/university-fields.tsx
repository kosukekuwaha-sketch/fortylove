"use client";

import { useEffect, useState } from "react";
import { REGISTRATION_DRAFT_KEY } from "./registration-draft";

const faculties: Record<string, string[]> = {
  "早稲田大学": ["政治経済学部", "法学部", "文化構想学部", "文学部", "教育学部", "商学部", "基幹理工学部", "創造理工学部", "先進理工学部", "社会科学部", "人間科学部", "スポーツ科学部", "国際教養学部"],
  "日本女子大学": ["家政学部", "文学部", "人間社会学部", "理学部", "国際文化学部", "建築デザイン学部", "食科学部"],
  "東京女子大学": ["現代教養学部"],
};

export function UniversityFields() {
  const [university, setUniversity] = useState("");
  const [customUniversity, setCustomUniversity] = useState("");
  const [faculty, setFaculty] = useState("");
  const [customFaculty, setCustomFaculty] = useState("");
  const universityValue = university === "その他" ? customUniversity : university;
  const facultyValue = faculty === "その他" ? customFaculty : faculty;

  useEffect(() => {
    const saved = sessionStorage.getItem(REGISTRATION_DRAFT_KEY);
    if (!saved) return;
    const values = JSON.parse(saved) as Record<string, string>;
    setUniversity(values.university_choice ?? "");
    setCustomUniversity(values.custom_university ?? "");
    setFaculty(values.faculty_choice ?? "");
    setCustomFaculty(values.custom_faculty ?? "");
  }, []);

  return <>
    <label>大学
      <select name="university_choice" value={university} onChange={(event) => {
        setUniversity(event.target.value);
        setFaculty("");
        setCustomFaculty("");
      }} required>
        <option value="">選択してください</option>
        {Object.keys(faculties).map((name) => <option key={name}>{name}</option>)}
        <option>その他</option>
      </select>
    </label>
    {university === "その他" && <label>大学名
      <input name="custom_university" value={customUniversity} onChange={(event) => setCustomUniversity(event.target.value)} placeholder="大学名を入力" required />
    </label>}
    <input type="hidden" name="university" value={universityValue} />
    {university && <label>学部
      <select name="faculty_choice" value={faculty} onChange={(event) => setFaculty(event.target.value)} required>
        <option value="">選択してください</option>
        {(faculties[university] ?? []).map((name) => <option key={name}>{name}</option>)}
        <option>その他</option>
      </select>
    </label>}
    {faculty === "その他" && <label>学部名
      <input name="custom_faculty" value={customFaculty} onChange={(event) => setCustomFaculty(event.target.value)} placeholder="学部名を入力" required />
    </label>}
    <input type="hidden" name="faculty" value={facultyValue} />
  </>;
}
