interface GradeBadgeProps {
  grade: string;
  size?: "sm" | "lg";
}

const GradeBadge = ({ grade, size = "sm" }: GradeBadgeProps) => {
  const normalized = grade?.toLowerCase() || "";
  const className = normalized.includes("alto")
    ? "grade-badge-alto"
    : normalized.includes("moderado") || normalized.includes("médio")
    ? "grade-badge-moderado"
    : "grade-badge-baixo";

  const label = normalized.includes("alto")
    ? "GRADE A"
    : normalized.includes("moderado") || normalized.includes("médio")
    ? "GRADE B"
    : "GRADE C";

  return (
    <span className={`${className} ${size === "lg" ? "text-sm px-4 py-1.5" : ""}`}>
      {label}
    </span>
  );
};

export default GradeBadge;
