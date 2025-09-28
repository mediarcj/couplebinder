// File: server/knex/seeds/001_users.js
// Description: Seed file for users table with test data
// Purpose: Provides sample user data for testing and development
// Notes: Creates test users with various profile configurations

const { createPasswordHash } = require('../../middleware/password');

exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('users').del();
  
  // Hash passwords for test users
  const hashedPassword1 = await createPasswordHash('password123');
  const hashedPassword2 = await createPasswordHash('password456');
  const hashedPassword3 = await createPasswordHash('admin123');
  
  // Inserts seed entries
  await knex('users').insert([
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      email: 'john.doe@example.com',
      password: hashedPassword1.stored,
      first_name: 'John',
      last_name: 'Doe',
      phone: '1-555-123-4567',
      birthday: '1990-05-15',
      gender: 'male',
      language: 'English',
      city_province: 'New York',
      country: 'USA',
      relationship_status: 'single',
      job: 'employed',
      hobbies: 'Reading, Hiking, Photography',
      music: 'Rock, Jazz',
      fav_food: 'Italian',
      profile_title: 'Software Engineer',
      profile_description: 'Passionate about technology and outdoor adventures.',
      account_privacy: 'public',
      user_role: 'user'
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      email: 'jane.smith@example.com',
      password: hashedPassword2.stored,
      first_name: 'Jane',
      last_name: 'Smith',
      phone: '1-555-987-6543',
      birthday: '1988-12-03',
      gender: 'female',
      language: 'English',
      city_province: 'Los Angeles',
      country: 'USA',
      social_media1: 'https://twitter.com/janesmith',
      social_media2: 'https://linkedin.com/in/janesmith',
      relationship_status: 'married',
      job: 'employed',
      hobbies: 'Yoga, Cooking, Travel',
      music: 'Classical, Electronic',
      fav_food: 'Thai',
      profile_title: 'Marketing Manager',
      profile_description: 'Creative professional with a love for travel and wellness.',
      account_privacy: 'private',
      user_role: 'user'
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      email: 'admin@detechify.com',
      password: hashedPassword3.stored,
      first_name: 'Admin',
      last_name: 'User',
      phone: '1-555-000-0000',
      birthday: '1985-01-01',
      gender: 'male',
      language: 'English',
      city_province: 'San Francisco',
      country: 'USA',
      relationship_status: 'single',
      job: 'employed',
      profile_title: 'System Administrator',
      profile_description: 'System administrator for Detechify platform.',
      account_privacy: 'private',
      user_role: 'admin'
    }
  ]);
};
