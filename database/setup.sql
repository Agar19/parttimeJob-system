-- Create database
CREATE DATABASE schedule_app;

-- Connect to the database
\c schedule_app

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User roles enum
CREATE TYPE user_role AS ENUM ('Admin', 'Manager', 'Employee');

-- Employee status enum
CREATE TYPE employee_status AS ENUM ('Active', 'Inactive');

-- Shift status enum
CREATE TYPE shift_status AS ENUM ('Pending', 'Approved', 'Canceled');

-- Request status enum
CREATE TYPE request_status AS ENUM ('Pending', 'Approved', 'Rejected');

-- Create Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Branches table
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    location TEXT,
    manager_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Employees table
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    status employee_status DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, branch_id)
);

-- Create Schedules table
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(branch_id, week_start)
);

-- Create Shifts table
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id UUID REFERENCES schedules(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    status shift_status DEFAULT 'Pending',
    CHECK (end_time > start_time)
);

-- Create Requests table
CREATE TABLE requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
    status request_status DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Employee Availability table
CREATE TABLE availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    CHECK (end_time > start_time)
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_employees_user_id ON employees(user_id);
CREATE INDEX idx_employees_branch_id ON employees(branch_id);
CREATE INDEX idx_schedules_branch_id ON schedules(branch_id);
CREATE INDEX idx_shifts_schedule_id ON shifts(schedule_id);
CREATE INDEX idx_shifts_employee_id ON shifts(employee_id);
CREATE INDEX idx_availability_employee_id ON availability(employee_id);

-- Create sample seed data
INSERT INTO users (id, name, email, password, role, phone) VALUES
-- Admin user
(uuid_generate_v4(), 'Admin User', 'admin@example.com', '$2b$10$rNCLh1G8YOHfYGl0McJ.WeDGotB2R5zNHshjHhGQcBx0nMICy5kjm', 'Admin', '+97699887766'),
-- Manager users
(uuid_generate_v4(), 'Энхбаатар', 'manager@example.com', '$2b$10$rNCLh1G8YOHfYGl0McJ.WeDGotB2R5zNHshjHhGQcBx0nMICy5kjm', 'Manager', '+97699887755'),
-- Employee users
(uuid_generate_v4(), 'Батаа', 'employee1@example.com', '$2b$10$rNCLh1G8YOHfYGl0McJ.WeDGotB2R5zNHshjHhGQcBx0nMICy5kjm', 'Employee', '+97699887744'),
(uuid_generate_v4(), 'Болд', 'employee2@example.com', '$2b$10$rNCLh1G8YOHfYGl0McJ.WeDGotB2R5zNHshjHhGQcBx0nMICy5kjm', 'Employee', '+97699887733'),
(uuid_generate_v4(), 'Мөнх-Эрдэнэ', 'employee3@example.com', '$2b$10$rNCLh1G8YOHfYGl0McJ.WeDGotB2R5zNHshjHhGQcBx0nMICy5kjm', 'Employee', '+97699887722'),
(uuid_generate_v4(), 'Ганбат', 'employee4@example.com', '$2b$10$rNCLh1G8YOHfYGl0McJ.WeDGotB2R5zNHshjHhGQcBx0nMICy5kjm', 'Employee', '+97699887711');

-- Get manager ID
DO $$
DECLARE
    manager_id UUID;
    employee1_id UUID;
    employee2_id UUID;
    employee3_id UUID;
    employee4_id UUID;
    branch1_id UUID;
    branch2_id UUID;
BEGIN
    SELECT id INTO manager_id FROM users WHERE email = 'manager@example.com';
    SELECT id INTO employee1_id FROM users WHERE email = 'employee1@example.com';
    SELECT id INTO employee2_id FROM users WHERE email = 'employee2@example.com';
    SELECT id INTO employee3_id FROM users WHERE email = 'employee3@example.com';
    SELECT id INTO employee4_id FROM users WHERE email = 'employee4@example.com';
    
    -- Create branches
    INSERT INTO branches (id, name, location, manager_id) VALUES
    (uuid_generate_v4(), 'Төв салбар', 'Сүхбаатарын талбай, Улаанбаатар', manager_id),
    (uuid_generate_v4(), 'Баруун дээд салбар', 'Баянгол дүүрэг, Улаанбаатар', manager_id),
    (uuid_generate_v4(), 'Өргөө салбар', 'Хан-Уул дүүрэг, Улаанбаатар', manager_id),
    (uuid_generate_v4(), 'Дархан салбар', 'Дархан, Дархан-Уул аймаг', manager_id),
    (uuid_generate_v4(), 'Эрдэнэт салбар', 'Эрдэнэт, Орхон аймаг', manager_id);
    
    SELECT id INTO branch1_id FROM branches WHERE name = 'Төв салбар';
    SELECT id INTO branch2_id FROM branches WHERE name = 'Баруун дээд салбар';
    
    -- Assign employees to branches
    INSERT INTO employees (id, user_id, branch_id, status) VALUES
    (uuid_generate_v4(), employee1_id, branch1_id, 'Active'),
    (uuid_generate_v4(), employee2_id, branch1_id, 'Active'),
    (uuid_generate_v4(), employee3_id, branch1_id, 'Active'),
    (uuid_generate_v4(), employee4_id, branch2_id, 'Active');
END $$;