declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: import("../models/user").UserRole;
        linkedStudentIds?: string[];
      };
    }
  }
}

export {};

