import { useParams, useLocation } from "wouter";
import { useEffect } from "react";

export default function InsurerClaimDetails() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const claimId = parseInt(id || "0");

  // Redirect to comparison view which has all the detailed information
  useEffect(() => {
    setLocation(`/insurer/claims/${claimId}/comparison`);
  }, [claimId, setLocation]);

  return null; // Redirecting...
}
