export interface Topic {
  id: string
  name: string
  domain: string
  description: string
  baselineWeight: number
}

export type DifficultyLevel = "foundational" | "core" | "advanced"

export interface DiagnosticQuestion {
  id: string
  assessmentId: string
  topicId: string
  topicLabel: string
  text: string
  codeSnippet?: string
  options: string[]
  correctIndex: number
  difficulty: DifficultyLevel
  weight: number
  explanation: string
}

export interface AssessmentDefinition {
  id: string
  title: string
  description: string
  topicIds: string[]
  level: "beginner" | "intermediate" | "advanced"
}

export interface QuestionResponse {
  questionId: string
  topicId: string
  selectedOptionIndex: number | null
  isCorrect: boolean
  earnedScore: number
  maxScore: number
}

export interface TopicResult {
  topicId: string
  topicName: string
  totalQuestions: number
  correctQuestions: number
  accuracy: number
  weightedScore: number
  masteryScore: number
}

export interface AssessmentAttempt {
  id: string
  assessmentId: string
  assessmentTitle: string
  completedAt: string
  durationSeconds: number
  totalQuestions: number
  correctCount: number
  overallScore: number
  responses: QuestionResponse[]
  topicBreakdown: Record<string, TopicResult>
}

export const ASSESSMENTS: AssessmentDefinition[] = [
  {
    id: "algebra-readiness",
    title: "Algebra readiness",
    description: "Check foundational equation-solving and function skills.",
    topicIds: ["linear-equations", "functions"],
    level: "beginner",
  },
  {
    id: "geometry-essentials",
    title: "Geometry essentials",
    description: "Explore angle relationships and measurement of shapes.",
    topicIds: ["angles-and-lines", "area-and-perimeter"],
    level: "intermediate",
  },
  {
    id: "statistics-foundations",
    title: "Statistics foundations",
    description: "Practice summarizing data and reasoning about probability.",
    topicIds: ["descriptive-statistics", "probability"],
    level: "beginner",
  },
]

export const TOPICS: Topic[] = [
  {
    id: "linear-equations",
    name: "Linear Equations",
    domain: "Mathematics",
    description: "Solve linear equations and use equivalent operations to isolate a variable.",
    baselineWeight: 0.6,
  },
  {
    id: "functions",
    name: "Functions",
    domain: "Mathematics",
    description: "Evaluate functions and understand how inputs map to outputs.",
    baselineWeight: 0.4,
  },
  {
    id: "angles-and-lines",
    name: "Angles and Lines",
    domain: "Geometry",
    description: "Use angle relationships formed by intersecting and parallel lines.",
    baselineWeight: 0.5,
  },
  {
    id: "area-and-perimeter",
    name: "Area and Perimeter",
    domain: "Geometry",
    description: "Calculate two-dimensional area and perimeter from defining measurements.",
    baselineWeight: 0.5,
  },
  {
    id: "descriptive-statistics",
    name: "Descriptive Statistics",
    domain: "Statistics",
    description: "Summarize data sets using mean, median, mode, and range.",
    baselineWeight: 0.5,
  },
  {
    id: "probability",
    name: "Probability",
    domain: "Statistics",
    description: "Calculate event probabilities, including repeated and dependent draws.",
    baselineWeight: 0.5,
  },
]

export const QUESTIONS: DiagnosticQuestion[] = [
  {
    id: "ALG-LE-001",
    assessmentId: "algebra-readiness",
    topicId: "linear-equations",
    topicLabel: "Algebra · Linear Equations",
    text: "Solve 3x + 5 = 20.",
    options: ["3", "5", "8", "15"],
    correctIndex: 1,
    difficulty: "foundational",
    weight: 10,
    explanation: "Subtracting 5 from both sides gives 3x = 15. Dividing both sides by 3 gives x = 5.",
  },
  {
    id: "ALG-LE-002",
    assessmentId: "algebra-readiness",
    topicId: "linear-equations",
    topicLabel: "Algebra · Linear Equations",
    text: "What is the solution to 4(x − 2) = 2x + 6?",
    options: ["x = 5", "x = 6", "x = 7", "x = 14"],
    correctIndex: 2,
    difficulty: "core",
    weight: 15,
    explanation: "Expanding the left side gives 4x − 8 = 2x + 6, so subtracting 2x and adding 8 gives 2x = 14. Dividing by 2 gives x = 7.",
  },
  {
    id: "ALG-LE-003",
    assessmentId: "algebra-readiness",
    topicId: "linear-equations",
    topicLabel: "Algebra · Linear Equations",
    text: "Solve 3(2x − 1) − 4 = 2(x + 5) + x.",
    options: ["x = 17/3", "x = 3", "x = 7", "x = 17"],
    correctIndex: 0,
    difficulty: "advanced",
    weight: 20,
    explanation: "Expanding both sides gives 6x − 7 = 3x + 10. Subtracting 3x and adding 7 yields 3x = 17, so x = 17/3.",
  },
  {
    id: "ALG-FN-001",
    assessmentId: "algebra-readiness",
    topicId: "functions",
    topicLabel: "Algebra · Functions",
    text: "If f(x) = 2x + 3, what is f(4)?",
    options: ["8", "10", "11", "14"],
    correctIndex: 2,
    difficulty: "foundational",
    weight: 10,
    explanation: "Evaluating f(4) means replacing x with 4 in the rule. This gives 2 × 4 + 3 = 11.",
  },
  {
    id: "ALG-FN-002",
    assessmentId: "algebra-readiness",
    topicId: "functions",
    topicLabel: "Algebra · Functions",
    text: "For g(x) = x² − 2x, what is g(−3)?",
    options: ["3", "9", "15", "−3"],
    correctIndex: 2,
    difficulty: "core",
    weight: 15,
    explanation: "Substitute −3 for x to get (−3)² − 2(−3). The square is 9 and the second term is +6, so the value is 15.",
  },
  {
    id: "ALG-FN-003",
    assessmentId: "algebra-readiness",
    topicId: "functions",
    topicLabel: "Algebra · Functions",
    text: "If f(x) = 2x + 1 and g(x) = x², what is f(g(3))?",
    options: ["13", "18", "19", "37"],
    correctIndex: 2,
    difficulty: "advanced",
    weight: 20,
    explanation: "First evaluate the inner function: g(3) = 3² = 9. Then evaluate f(9) = 2 × 9 + 1 = 19.",
  },
  {
    id: "GEO-AL-001",
    assessmentId: "geometry-essentials",
    topicId: "angles-and-lines",
    topicLabel: "Geometry · Angles and Lines",
    text: "Two angles form a straight line. If one angle is 68°, what is the other?",
    options: ["22°", "68°", "112°", "292°"],
    correctIndex: 2,
    difficulty: "foundational",
    weight: 10,
    explanation: "Angles forming a straight line are supplementary, so their measures add to 180°. The missing angle is 180° − 68° = 112°.",
  },
  {
    id: "GEO-AL-002",
    assessmentId: "geometry-essentials",
    topicId: "angles-and-lines",
    topicLabel: "Geometry · Angles and Lines",
    text: "A triangle has two angles measuring 47° and 63°. What is its third angle?",
    options: ["60°", "70°", "80°", "110°"],
    correctIndex: 1,
    difficulty: "core",
    weight: 15,
    explanation: "The interior angles of any triangle add to 180°. Subtracting the known angles gives 180° − 47° − 63° = 70°.",
  },
  {
    id: "GEO-AL-003",
    assessmentId: "geometry-essentials",
    topicId: "angles-and-lines",
    topicLabel: "Geometry · Angles and Lines",
    text: "Two parallel lines are cut by a transversal. Same-side interior angles measure (4x + 10)° and (2x + 20)°. What is x?",
    options: ["15", "20", "25", "30"],
    correctIndex: 2,
    difficulty: "advanced",
    weight: 20,
    explanation: "Same-side interior angles between parallel lines are supplementary, so (4x + 10) + (2x + 20) = 180. This simplifies to 6x + 30 = 180, giving x = 25.",
  },
  {
    id: "GEO-AP-001",
    assessmentId: "geometry-essentials",
    topicId: "area-and-perimeter",
    topicLabel: "Geometry · Area and Perimeter",
    text: "What is the area of a rectangle that is 8 cm long and 5 cm wide?",
    options: ["13 cm²", "26 cm²", "40 cm²", "80 cm²"],
    correctIndex: 2,
    difficulty: "foundational",
    weight: 10,
    explanation: "The area of a rectangle is length multiplied by width. Here, 8 × 5 = 40, so its area is 40 cm².",
  },
  {
    id: "GEO-AP-002",
    assessmentId: "geometry-essentials",
    topicId: "area-and-perimeter",
    topicLabel: "Geometry · Area and Perimeter",
    text: "A triangle has a base of 12 cm and a perpendicular height of 7 cm. What is its area?",
    options: ["19 cm²", "42 cm²", "84 cm²", "168 cm²"],
    correctIndex: 1,
    difficulty: "core",
    weight: 15,
    explanation: "The area of a triangle is one-half its base multiplied by its perpendicular height. Thus, (12 × 7) ÷ 2 = 42 cm².",
  },
  {
    id: "GEO-AP-003",
    assessmentId: "geometry-essentials",
    topicId: "area-and-perimeter",
    topicLabel: "Geometry · Area and Perimeter",
    text: "What is the exact circumference of a circle with radius 3 cm?",
    options: ["3π cm", "6π cm", "9π cm", "12π cm"],
    correctIndex: 1,
    difficulty: "advanced",
    weight: 20,
    explanation: "Circumference is calculated with C = 2πr. Substituting r = 3 cm gives C = 6π cm.",
  },
  {
    id: "STAT-DS-001",
    assessmentId: "statistics-foundations",
    topicId: "descriptive-statistics",
    topicLabel: "Statistics · Descriptive Statistics",
    text: "What is the mean of 2, 4, 6, and 8?",
    options: ["4", "5", "6", "20"],
    correctIndex: 1,
    difficulty: "foundational",
    weight: 10,
    explanation: "The mean is the sum of the values divided by the number of values. Their sum is 20, and 20 ÷ 4 = 5.",
  },
  {
    id: "STAT-DS-002",
    assessmentId: "statistics-foundations",
    topicId: "descriptive-statistics",
    topicLabel: "Statistics · Descriptive Statistics",
    text: "What is the median of 3, 5, 7, 9, and 20?",
    options: ["5", "7", "8", "9"],
    correctIndex: 1,
    difficulty: "core",
    weight: 15,
    explanation: "The values are already in order, and with five values the median is the one in the middle. The third value is 7.",
  },
  {
    id: "STAT-DS-003",
    assessmentId: "statistics-foundations",
    topicId: "descriptive-statistics",
    topicLabel: "Statistics · Descriptive Statistics",
    text: "In the data set 2, 4, 4, 6, 9, the value 9 is replaced by 100. Which statement correctly describes the changes?",
    options: [
      "The mean increases by 18.2 and the range increases by 91.",
      "The mean increases by 91 and the range increases by 18.2.",
      "The median increases by 18.2 and the mode increases by 91.",
      "The mean and range both increase by 91.",
    ],
    correctIndex: 0,
    difficulty: "advanced",
    weight: 20,
    explanation: "The sum rises from 25 to 116, so the mean rises from 5 to 23.2, an increase of 18.2. The range rises from 9 − 2 = 7 to 100 − 2 = 98, an increase of 91.",
  },
  {
    id: "STAT-PR-001",
    assessmentId: "statistics-foundations",
    topicId: "probability",
    topicLabel: "Statistics · Probability",
    text: "A fair coin is flipped once. What is the probability of getting heads?",
    options: ["0", "1/4", "1/2", "1"],
    correctIndex: 2,
    difficulty: "foundational",
    weight: 10,
    explanation: "A fair coin has two equally likely outcomes: heads and tails. One of those two outcomes is heads, so the probability is 1/2.",
  },
  {
    id: "STAT-PR-002",
    assessmentId: "statistics-foundations",
    topicId: "probability",
    topicLabel: "Statistics · Probability",
    text: "A bag contains 3 red and 2 blue marbles. One marble is drawn, replaced, and then another is drawn. What is the probability that both draws are red?",
    options: ["3/10", "9/25", "2/5", "3/5"],
    correctIndex: 1,
    difficulty: "core",
    weight: 15,
    explanation: "Each draw has a 3/5 chance of being red, and replacing the first marble keeps the draws independent. The probability of two reds is (3/5) × (3/5) = 9/25.",
  },
  {
    id: "STAT-PR-003",
    assessmentId: "statistics-foundations",
    topicId: "probability",
    topicLabel: "Statistics · Probability",
    text: "A bag contains 4 red and 3 blue marbles. Two marbles are drawn without replacement. What is the probability that both are red?",
    options: ["2/7", "1/3", "4/7", "3/7"],
    correctIndex: 0,
    difficulty: "advanced",
    weight: 20,
    explanation: "The first draw is red with probability 4/7; without replacement, the second is red with probability 3/6. Multiplying gives (4/7) × (3/6) = 12/42 = 2/7.",
  },
]

export function getAssessmentById(id: string): AssessmentDefinition | undefined {
  return ASSESSMENTS.find((assessment) => assessment.id === id)
}

export function getTopicById(id: string): Topic | undefined {
  return TOPICS.find((topic) => topic.id === id)
}

export function getQuestionsForAssessment(assessmentId: string): DiagnosticQuestion[] {
  return QUESTIONS.filter((question) => question.assessmentId === assessmentId)
}

export function validateAssessmentData(): string[] {
  const errors: string[] = []
  const assessmentIds = new Set(ASSESSMENTS.map((assessment) => assessment.id))
  const topicIds = new Set<string>()
  const questionIds = new Set<string>()
  const validDifficulties = new Set<DifficultyLevel>(["foundational", "core", "advanced"])

  for (const topic of TOPICS) {
    if (topicIds.has(topic.id)) {
      errors.push(`Duplicate topic ID "${topic.id}".`)
    }
    topicIds.add(topic.id)
  }

  for (const assessment of ASSESSMENTS) {
    for (const topicId of assessment.topicIds) {
      if (!topicIds.has(topicId)) {
        errors.push(`Assessment "${assessment.id}" references unknown topic "${topicId}".`)
      }
    }
  }

  for (const question of QUESTIONS) {
    if (questionIds.has(question.id)) {
      errors.push(`Duplicate question ID "${question.id}".`)
    }
    questionIds.add(question.id)

    if (!assessmentIds.has(question.assessmentId)) {
      errors.push(`Question "${question.id}" references unknown assessment "${question.assessmentId}".`)
    }
    if (!topicIds.has(question.topicId)) {
      errors.push(`Question "${question.id}" references unknown topic "${question.topicId}".`)
    }
    if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= question.options.length) {
      errors.push(`Question "${question.id}" has an invalid correctIndex.`)
    }
    if (question.options.length !== 4) {
      errors.push(`Question "${question.id}" must have exactly four options.`)
    }
    if (!validDifficulties.has(question.difficulty)) {
      errors.push(`Question "${question.id}" has an invalid difficulty.`)
    }
    if (!Number.isInteger(question.weight) || question.weight <= 0) {
      errors.push(`Question "${question.id}" must have a positive integer weight.`)
    }
    if (!question.explanation.trim()) {
      errors.push(`Question "${question.id}" must have a non-empty explanation.`)
    }
  }

  return errors
}

if (process.env.NODE_ENV !== "production") {
  const errors = validateAssessmentData()
  if (errors.length > 0) {
    console.error("[AdaptIQ] Assessment data validation failed:", errors)
  }
}
