# KINGA - AutoVerify AI Project TODO

## Phase 1: Database Schema & Core Setup
- [x] Update database schema with all required tables (claims, assessments, quotes, audit_trail, panel_beaters, appointments)
- [x] Add role enum to users table (insurer, assessor, panel_beater, claimant)
- [x] Create database query helpers for all tables
- [x] Push schema changes to database

## Phase 2: Authentication & Role-Based Access Control
- [x] Create ProtectedRoute component with role-based access control
- [x] Implement role-based redirect logic after login
- [x] Create separate routes for each user role dashboard
- [x] Add authentication error handling and timeout logic
- [ ] Test login flow for all four user roles

## Phase 3: Dashboard Components
- [x] Create InsurerDashboard component with metrics and claims overview
- [x] Create AssessorDashboard component with assigned claims list
- [x] Create PanelBeaterDashboard component with quote requests
- [x] Create ClaimantDashboard component with claim submission and tracking
- [x] Add role-specific navigation menus for each dashboard

## Phase 4: Claims Submission Workflow
- [x] Create claim submission form with vehicle and incident details
- [x] Implement image upload functionality for damage photos (S3 integration)
- [x] Add panel beater selection interface (select 3 from approved list)
- [x] Create tRPC procedures for claim submission
- [x] Add claim submission confirmation and tracking

## Phase 5: Insurer Triage Dashboard
- [ ] Create claims triage interface with pending claims list
- [ ] Add policy payment verification workflow
- [ ] Implement AI assessment trigger button
- [ ] Add assessor assignment interface
- [ ] Create claim status update functionality

## Phase 6: Assessor Workflow
- [ ] Create assigned claims list view for assessors
- [ ] Implement appointment scheduling with claimants
- [ ] Add appointment scheduling with panel beaters
- [ ] Create damage assessment form with cost estimation
- [ ] Implement quote modification interface with panel beater agreement
- [ ] Add audit trail logging for all modifications

## Phase 7: Panel Beater Portal
- [ ] Create quote requests list view
- [ ] Implement repair quote submission form
- [ ] Add appointment coordination with assessors
- [ ] Create quote modification approval interface
- [ ] Add notification system for new assignments

## Phase 8: Insurer Comparison View
- [ ] Create side-by-side comparison interface
- [ ] Display AI assessment results
- [ ] Display assessor evaluation report
- [ ] Display all panel beater quotes
- [ ] Add fraud risk indicators and highlights
- [ ] Implement repair assignment selection

## Phase 9: AI Damage Assessment Integration
- [ ] Set up AI image analysis API integration
- [ ] Create damage detection algorithm
- [ ] Implement cost estimation logic
- [ ] Add fraud pattern detection
- [ ] Create AI assessment report generation

## Phase 10: Audit Trail System
- [ ] Create audit_trail table schema
- [ ] Implement logging for all quote modifications
- [ ] Add logging for assessment changes
- [ ] Track claim status updates with timestamps
- [ ] Create audit trail viewer for insurers
- [ ] Add user attribution to all audit entries

## Phase 11: Testing & Polish
- [ ] Test complete claims lifecycle end-to-end
- [ ] Verify role-based access control for all routes
- [ ] Test all four user role dashboards
- [ ] Verify data isolation between roles
- [ ] Test image upload and storage
- [ ] Verify audit trail completeness
- [ ] Add loading states and error handling
- [ ] Polish UI/UX for all components
- [ ] Create comprehensive vitest tests
- [ ] Create project checkpoint for deployment
