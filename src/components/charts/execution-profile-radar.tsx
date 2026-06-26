"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

interface ExecutionProfileRadarProps {
  scores: {
    focus: number;
    consistency: number;
    clarity: number;
    momentum: number;
    openness: number;
  };
}

export function ExecutionProfileRadar({ scores }: ExecutionProfileRadarProps) {
  const data = [
    { axis: "Focus", value: scores.focus },
    { axis: "Consistency", value: scores.consistency },
    { axis: "Clarity", value: scores.clarity },
    { axis: "Momentum", value: scores.momentum },
    { axis: "Openness", value: scores.openness },
  ];

  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="var(--border-subtle)" />
        <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--text-muted)", fontSize: 10 }} />
        <Radar
          dataKey="value"
          stroke="var(--accent-primary)"
          fill="var(--accent-primary)"
          fillOpacity={0.25}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
