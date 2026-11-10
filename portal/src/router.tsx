import {
  createBrowserRouter,
  Navigate,
} from 'react-router-dom';

import CancelSuccess from './pages/CancelSuccess';
import { CharacterDemo } from './pages/CharacterDemo';
import { EntityControl } from './pages/EntityControl';
import { Evals } from './pages/Evals';
import { GetStartedPage } from './pages/GetStarted';
import { Ledger } from './pages/Ledger';
import Login from './pages/Login';
import { Logs } from './pages/Logs';
import MagicAuth from './pages/MagicAuth';
import NotFound from './pages/NotFound';
import PaymentSuccess from './pages/PaymentSuccess';
import { Playground } from './pages/Playground';
import { Referral } from './pages/Referral';
import { ReportCard } from './pages/ReportCard';
import Room from './pages/Room';
import { SessionAnnotator } from './pages/SessionAnnotator';
import { Shadow } from './pages/Shadow';
import { SharedLedger } from './pages/SharedLedger';
import { Timeline } from './pages/Timeline';
import { Wrapped } from './pages/Wrapped';
import { WrappedV1 } from './pages/WrappedV1';

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/auth/magic",
    element: <MagicAuth />,
  },
  {
    path: "/referral/:referralCode",
    element: <Referral />,
  },
  {
    path: "/evaluation",
    loader: () => {
      // Preserve query params (like ref code)
      const params = new URLSearchParams(window.location.search);
      const redirectUrl = params.toString()
        ? `https://acadialearning.org/evaluation?${params.toString()}`
        : "https://acadialearning.org/evaluation";
      window.location.replace(redirectUrl);
      return null;
    },
    element: null,
  },
  {
    path: "/payment/success",
    element: <PaymentSuccess />,
  },
  {
    path: "/payment/canceled",
    element: <CancelSuccess />,
  },
  {
    path: "/annotate",
    element: <SessionAnnotator />,
  },
  {
    path: "/logs",
    element: <Logs />,
  },
  {
    path: "/ledger",
    element: <Ledger />,
  },
  {
    path: "/shared-ledger/:token",
    element: <SharedLedger />,
  },
  {
    path: "/evals",
    element: <Evals />,
  },
  {
    path: "/shadow",
    element: <Shadow />,
  },
  {
    path: "/playground",
    element: <Playground />,
  },
  {
    path: "/report-card/:id",
    element: <ReportCard />,
  },
  {
    path: "/wrapped",
    element: <Wrapped />,
  },
  {
    path: "/wrapped/:profileId/:year",
    element: <WrappedV1 />,
  },
  {
    path: "/wrapped/v1/:profileId/:year",
    element: <WrappedV1 />,
  },
  {
    path: "/get-started",
    element: <GetStartedPage />,
  },
  {
    path: "/character",
    element: <CharacterDemo />,
  },
  {
    path: "/timeline",
    element: <Timeline />,
  },
  {
    path: "/entity-control",
    element: <EntityControl />,
  },
  {
    path: "/entity-control/:entityId",
    element: <EntityControl />,
  },
  {
    path: "/",
    element: <Room />,
  },
  {
    path: "/404",
    element: <NotFound />,
  },
  {
    path: "*",
    element: <Navigate to="/404" replace />,
  },
]);
