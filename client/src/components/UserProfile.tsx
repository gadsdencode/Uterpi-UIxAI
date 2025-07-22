import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { User, Mail } from 'lucide-react';
import { useAuth, type UpdateProfileData } from '../hooks/useAuth';
import { toast } from 'sonner';
import { EmailPreferences } from './EmailPreferences';

export const UserProfile: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<UpdateProfileData>({
    firstName: '',
    lastName: '',
    username: '',
    age: undefined,
    dateOfBirth: '',
    bio: '',
  });

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        age: user.age || undefined,
        dateOfBirth: user.dateOfBirth || '',
        bio: user.bio || '',
      });
    }
  }, [user]);

  const handleInputChange = (field: keyof UpdateProfileData, value: string | number | undefined) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Only send fields that have values
      const dataToUpdate: UpdateProfileData = {};
      
      if (formData.firstName?.trim()) dataToUpdate.firstName = formData.firstName.trim();
      if (formData.lastName?.trim()) dataToUpdate.lastName = formData.lastName.trim();
      if (formData.username?.trim()) dataToUpdate.username = formData.username.trim();
      if (formData.age && formData.age > 0) dataToUpdate.age = formData.age;
      if (formData.dateOfBirth?.trim()) dataToUpdate.dateOfBirth = formData.dateOfBirth.trim();
      if (formData.bio?.trim()) dataToUpdate.bio = formData.bio.trim();

      await updateProfile(dataToUpdate);
      toast.success('Profile updated successfully!');
    } catch (error) {
      console.error('Profile update error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  const displayName = user.firstName && user.lastName 
    ? `${user.firstName} ${user.lastName}`
    : user.username || user.email;

  const initials = user.firstName && user.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user.username
    ? user.username[0].toUpperCase()
    : user.email[0].toUpperCase();

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={user.avatar || undefined} alt={displayName} />
            <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
          </Avatar>
        </div>
        <CardTitle>Account Settings</CardTitle>
        <CardDescription>
          Manage your personal information and email preferences
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email Preferences
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6 mt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                type="text"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                placeholder="Enter your first name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                type="text"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                placeholder="Enter your last name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              value={formData.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              placeholder="Choose a username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={user.email}
              disabled
              className="bg-muted"
            />
            <p className="text-sm text-muted-foreground">
              Email cannot be changed
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="number"
                min="13"
                max="120"
                value={formData.age || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  handleInputChange('age', value ? parseInt(value) : undefined);
                }}
                placeholder="Enter your age"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => handleInputChange('bio', e.target.value)}
              placeholder="Tell us about yourself..."
              className="min-h-[100px]"
              maxLength={500}
            />
            <p className="text-sm text-muted-foreground">
              {formData.bio?.length || 0}/500 characters
            </p>
          </div>

              <div className="flex justify-end space-x-2">
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="email" className="space-y-6 mt-6">
            <EmailPreferences />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}; 