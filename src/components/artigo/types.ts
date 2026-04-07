export type DomainStatus = "baixo" | "preocupações" | "alto" | "nao_avaliado";

export interface RobDomain {
  id: string;
  label: string;
  status: DomainStatus;
  detail: string;
}

export type ArtigoData = Record<string, any>;
