export const NOTE_TEMPLATES = [
  {
    id: "lecture",
    label: "Lecture Notes",
    emoji: "🎓",
    tag: "Lecture",
    title: "Lecture: [Course Name] - [Topic]",
    description: "Cornell-style lecture notes with cues and summary",
    content: `# [Course Name]: [Lecture Topic]
**Date:** [Date] | **Lecturer:** [Name]

---

### 🎯 Key Concept / Objective
> What is the single most important idea from this lecture?

---

### 📝 Notes & Flow
- 
- 
- 

### 💡 Core Takeaways & Formulas
1. 
2. 

### ❓ Questions for Seminars / Office Hours
- [ ] Ask about: 

---

### 📌 Summary (2-3 Sentences)
- `
  },
  {
    id: "revision",
    label: "Exam Revision",
    emoji: "📚",
    tag: "Study",
    title: "Revision: [Subject / Module]",
    description: "Active recall questions and high-yield summary",
    content: `# Revision Sheet: [Subject / Module]
**Exam Date:** [Date] | **Target Grade:** [e.g. 1st / A*]

---

### 🧠 Active Recall Questions (Test yourself before reading notes!)
1. What is the fundamental mechanism of...?
   - 
2. Compare and contrast X with Y:
   - 
3. Why does Z happen under condition W?
   - 

---

### 🔑 Essential Definitions & Rules
- **Term 1:** 
- **Term 2:** 

### ⚠️ Common Pitfalls / Easy-to-Lose Marks
- Avoid confusing ... with ...
- Remember to always state units / assumptions

---

### 🎯 Confidence Rating
- [ ] Red (Need to re-read)
- [ ] Amber (Know basics, need drill)
- [x] Green (Exam ready)`
  },
  {
    id: "essay",
    label: "Essay Outline",
    emoji: "📝",
    tag: "Essay",
    title: "Essay: [Prompt / Working Title]",
    description: "Structured essay argument, citations and counterpoints",
    content: `# Working Title: [Essay Title]
**Target Word Count:** 2,000 | **Deadline:** [Date]

---

### 🎯 Core Thesis Statement
> State your central argument clearly in 1-2 punchy sentences.

---

### 🧱 Argument Breakdown

#### 1. Introduction & Context
- Hook & contemporary relevance
- Define key operational terms
- Thesis road map

#### 2. Main Argument 1 (Strongest Point)
- Point: 
- Evidence / Academic Citation: 
- Analysis & Link back to thesis: 

#### 3. Main Argument 2 (Nuance / Complexity)
- Point: 
- Evidence / Case Study: 
- Analysis: 

#### 4. Counter-Argument & Rebuttal
- Critic's view: 
- Why this critique falls short: 

#### 5. Conclusion
- Synthesis of findings (don't just repeat points)
- Broader implications / open questions

---

### 📚 Bibliography / Sources To Check
- [ ] Source 1 (Author, Year)
- [ ] Source 2`
  },
  {
    id: "study_plan",
    label: "Study Sprint",
    emoji: "⚡",
    tag: "Study",
    title: "Study Sprint: [Date / Goal]",
    description: "Laser-focused study sprint and task breakdown",
    content: `# Study Sprint: [Goal for Today]

### 🎯 The 1 Thing That MUST Get Done
- [ ] 

### ⏱️ Pomodoro / Block Schedule
- **Block 1 (25m):** Deep focus on reading / draft
- **Block 2 (25m):** Practice problems / flashcards
- **Block 3 (25m):** Notes synthesis & review

### 📦 Stray Thoughts & Distractions (Parking Lot)
*(Write them down here so you don't break focus!)*
- `
  },
  {
    id: "braindump",
    label: "Brain Dump",
    emoji: "💡",
    tag: "Ideas",
    title: "Brain Dump: [Topic / Date]",
    description: "Unfiltered thinking canvas with quick actions",
    content: `# Brain Dump

### 🌊 Unfiltered Thoughts
- 

### ⚡ Quick Wins (< 5 mins)
- [ ] 
- [ ] 

### 🚀 Projects to Pursue Later
- `
  },
  {
    id: "daily",
    label: "Daily Reflection",
    emoji: "🌱",
    tag: "Daily",
    title: "Daily Reflection: [Today]",
    description: "Mindful daily journaling and habit check",
    content: `# Daily Reflection

### 🌟 3 Wins Today
1. 
2. 
3. 

### 💡 What Stood Out or Challenged Me?
- 

### 🎯 Priority Habit for Tomorrow
- `
  }
];

export const DEFAULT_TAGS = ["All", "Lecture", "Study", "Essay", "Ideas", "Daily", "General"];
