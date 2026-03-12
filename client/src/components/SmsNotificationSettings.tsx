import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Phone, Shield, MessageSquare, Clock, Send } from 'lucide-react';
import { useSnackbar } from './SnackbarProvider';
import { 
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Form schemas
const phoneVerificationSchema = z.object({
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be in E.164 format (e.g., +14155552671)'),
});

const verificationCodeSchema = z.object({
  verificationCode: z.string().length(6, 'Verification code must be 6 digits'),
});

const smsPreferencesSchema = z.object({
  enableSms: z.boolean(),
  alertNotifications: z.boolean(),
  reminderNotifications: z.boolean(),
  promotionalNotifications: z.boolean(),
  quietHoursStart: z.string().optional(),
  quietHoursEnd: z.string().optional(),
  timezone: z.string(),
  dailyLimit: z.number().int().min(1).max(100),
});

type SmsPreferences = z.infer<typeof smsPreferencesSchema>;

interface PreferencesResponse {
  success: boolean;
  preferences: {
    enableSms: boolean;
    phoneNumber: string | null;
    phoneVerified: boolean;
    alertNotifications: boolean;
    reminderNotifications: boolean;
    promotionalNotifications: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    timezone: string;
    dailyLimit: number;
  } | null;
}

export function SmsNotificationSettings() {
  const { toast } = useToast();
  const { show: showSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [showVerificationInput, setShowVerificationInput] = useState(false);
  const [pendingPhoneNumber, setPendingPhoneNumber] = useState('');

  // Query for SMS preferences
  const { data: preferences, isLoading: preferencesLoading } = useQuery<PreferencesResponse>({
    queryKey: ['/api/sms/preferences'],
    queryFn: async () => {
      const response = await fetch('/api/sms/preferences', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch preferences');
      }
      return response.json();
    },
  });

  // Phone verification form
  const phoneForm = useForm<z.infer<typeof phoneVerificationSchema>>({
    resolver: zodResolver(phoneVerificationSchema),
    defaultValues: {
      phoneNumber: '',
    },
  });

  // Verification code form
  const codeForm = useForm<z.infer<typeof verificationCodeSchema>>({
    resolver: zodResolver(verificationCodeSchema),
    defaultValues: {
      verificationCode: '',
    },
  });

  // Preferences form
  const preferencesForm = useForm<SmsPreferences>({
    resolver: zodResolver(smsPreferencesSchema),
    defaultValues: {
      enableSms: false,
      alertNotifications: true,
      reminderNotifications: true,
      promotionalNotifications: false,
      quietHoursStart: '',
      quietHoursEnd: '',
      timezone: 'UTC',
      dailyLimit: 10,
    },
  });

  // Update form values when preferences load
  useEffect(() => {
    if (preferences?.preferences) {
      preferencesForm.reset({
        enableSms: preferences.preferences.enableSms ?? false,
        alertNotifications: preferences.preferences.alertNotifications ?? true,
        reminderNotifications: preferences.preferences.reminderNotifications ?? true,
        promotionalNotifications: preferences.preferences.promotionalNotifications ?? false,
        quietHoursStart: preferences.preferences.quietHoursStart ?? '',
        quietHoursEnd: preferences.preferences.quietHoursEnd ?? '',
        timezone: preferences.preferences.timezone ?? 'UTC',
        dailyLimit: preferences.preferences.dailyLimit ?? 10,
      });

      if (preferences.preferences.phoneNumber) {
        phoneForm.setValue('phoneNumber', preferences.preferences.phoneNumber);
      }
    }
  }, [preferences]);

  // Send verification code mutation
  const sendVerificationMutation = useMutation({
    mutationFn: async (data: z.infer<typeof phoneVerificationSchema>) => {
      const response = await fetch('/api/sms/verify-phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send verification code');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      setPendingPhoneNumber(variables.phoneNumber);
      setShowVerificationInput(true);
      showSnackbar('Verification code sent successfully', 'success');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send verification code',
      });
    },
  });

  // Confirm verification mutation
  const confirmVerificationMutation = useMutation({
    mutationFn: async (data: z.infer<typeof verificationCodeSchema>) => {
      const response = await fetch('/api/sms/confirm-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          phoneNumber: pendingPhoneNumber,
          verificationCode: data.verificationCode,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Invalid verification code');
      }
      return response.json();
    },
    onSuccess: () => {
      setShowVerificationInput(false);
      setPendingPhoneNumber('');
      codeForm.reset();
      showSnackbar('Phone number verified successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['/api/sms/preferences'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Invalid verification code',
      });
    },
  });

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: SmsPreferences) => {
      const response = await fetch('/api/sms/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update preferences');
      }
      return response.json();
    },
    onSuccess: () => {
      showSnackbar('SMS preferences updated successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['/api/sms/preferences'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update preferences',
      });
    },
  });

  const onPhoneSubmit = (data: z.infer<typeof phoneVerificationSchema>) => {
    sendVerificationMutation.mutate(data);
  };

  const onCodeSubmit = (data: z.infer<typeof verificationCodeSchema>) => {
    confirmVerificationMutation.mutate(data);
  };

  const onPreferencesSubmit = (data: SmsPreferences) => {
    updatePreferencesMutation.mutate(data);
  };

  if (preferencesLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const isPhoneVerified = preferences?.preferences?.phoneVerified;

  return (
    <div className="space-y-6">
      {/* Phone Verification Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Phone Verification
          </CardTitle>
          <CardDescription>
            Verify your phone number to receive SMS notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPhoneVerified ? (
            <div className="flex items-center gap-2 text-green-600">
              <Shield className="h-5 w-5" />
              <span className="text-sm font-medium">
                Phone verified: {preferences?.preferences?.phoneNumber}
              </span>
            </div>
          ) : (
            <>
              {!showVerificationInput ? (
                <Form {...phoneForm}>
                  <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
                    <FormField
                      control={phoneForm.control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="tel"
                              placeholder="+14155552671"
                              data-testid="input-phone"
                            />
                          </FormControl>
                          <FormDescription>
                            Enter your phone number in international format (E.164)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button 
                      type="submit" 
                      disabled={sendVerificationMutation.isPending}
                      data-testid="button-send-verification"
                    >
                      {sendVerificationMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Send Verification Code
                    </Button>
                  </form>
                </Form>
              ) : (
                <Form {...codeForm}>
                  <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-4">
                    <div className="text-sm text-muted-foreground mb-2">
                      Verification code sent to: {pendingPhoneNumber}
                    </div>
                    <FormField
                      control={codeForm.control}
                      name="verificationCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Verification Code</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="text"
                              placeholder="123456"
                              maxLength={6}
                              data-testid="input-verification-code"
                            />
                          </FormControl>
                          <FormDescription>
                            Enter the 6-digit code sent to your phone
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex gap-2">
                      <Button 
                        type="submit" 
                        disabled={confirmVerificationMutation.isPending}
                        data-testid="button-confirm-verification"
                      >
                        {confirmVerificationMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Verify
                      </Button>
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={() => {
                          setShowVerificationInput(false);
                          setPendingPhoneNumber('');
                          codeForm.reset();
                        }}
                        data-testid="button-cancel-verification"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* SMS Preferences Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            SMS Notification Preferences
          </CardTitle>
          <CardDescription>
            Customize which notifications you receive via SMS
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...preferencesForm}>
            <form onSubmit={preferencesForm.handleSubmit(onPreferencesSubmit)} className="space-y-6">
              <FormField
                control={preferencesForm.control}
                name="enableSms"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Enable SMS Notifications</FormLabel>
                      <FormDescription>
                        Receive important notifications via SMS
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!isPhoneVerified}
                        data-testid="switch-enable-sms"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {preferencesForm.watch('enableSms') && (
                <>
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Notification Types</h4>
                    
                    <FormField
                      control={preferencesForm.control}
                      name="alertNotifications"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between space-x-2">
                          <FormLabel className="text-sm font-normal">
                            Alert Notifications
                          </FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-alert-notifications"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={preferencesForm.control}
                      name="reminderNotifications"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between space-x-2">
                          <FormLabel className="text-sm font-normal">
                            Reminder Notifications
                          </FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-reminder-notifications"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={preferencesForm.control}
                      name="promotionalNotifications"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between space-x-2">
                          <FormLabel className="text-sm font-normal">
                            Promotional Notifications
                          </FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-promotional-notifications"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Quiet Hours
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={preferencesForm.control}
                        name="quietHoursStart"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Time</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="time"
                                data-testid="input-quiet-hours-start"
                              />
                            </FormControl>
                            <FormDescription>
                              No SMS after this time
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={preferencesForm.control}
                        name="quietHoursEnd"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Time</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="time"
                                data-testid="input-quiet-hours-end"
                              />
                            </FormControl>
                            <FormDescription>
                              SMS resumes after this time
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <FormField
                      control={preferencesForm.control}
                      name="timezone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Timezone</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-timezone">
                                <SelectValue placeholder="Select timezone" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="UTC">UTC</SelectItem>
                              <SelectItem value="America/New_York">Eastern Time</SelectItem>
                              <SelectItem value="America/Chicago">Central Time</SelectItem>
                              <SelectItem value="America/Denver">Mountain Time</SelectItem>
                              <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                              <SelectItem value="Europe/London">London</SelectItem>
                              <SelectItem value="Europe/Paris">Paris</SelectItem>
                              <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Your timezone for quiet hours
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={preferencesForm.control}
                      name="dailyLimit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Daily SMS Limit</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              min={1}
                              max={100}
                              onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                              data-testid="input-daily-limit"
                            />
                          </FormControl>
                          <FormDescription>
                            Maximum number of SMS messages per day (1-100)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              )}

              <Button 
                type="submit" 
                disabled={updatePreferencesMutation.isPending || !isPhoneVerified}
                data-testid="button-save-preferences"
              >
                {updatePreferencesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Save Preferences
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}