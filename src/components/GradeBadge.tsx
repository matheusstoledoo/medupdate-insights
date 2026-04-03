interface GradeBadgeProps {
  grade: string;
  size?: "sm" | "lg";
}

const GradeBadge = ({ grade, size = "sm" }: GradeBadgeProps) => {
  const normalized = grade?.toLowerCase() || "";

  let className: string;
  let label: string;

  if (normalized.includes("muito baixo")) {
    className = "grade-badge-muito-baixo";
    label = "GRADE D";
  } else if (normalized.includes("alto")) {
    className = "grade-badge-alto";
    label = "GRADE A";
  } else if (normalized.includes("moderado") || normalized.includes("médio")) {
    className = "grade-badge-moderado";
    label = "GRADE B";
  } else if (normalized.includes("baixo")) {
    className = "grade-badge-baixo";
    label = "GRADE C";
  } else {
    className = "grade-badge-baixo";
    label = "GRADE C";
  }

  const sizeClass = size === "lg" ? "text-xs px-3 py-1" : "";

  return (
    <span className={`${className} ${sizeClass}`}>
      {label}
    </span>
  );
};

export default GradeBadge;
