import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Edit, UserX, UserCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const professionalSchema = z.object({
  email: z.string().email('Email inválido').min(1, 'Email é obrigatório'),
  specialty: z.string().optional(),
  crp: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active')
});

type ProfessionalFormData = z.infer<typeof professionalSchema>;

interface Professional {
  id: string;
  email: string;
  specialty?: string;
  crp?: string;
  phone?: string;
  bio?: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export default function Profissionais() {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
  const { toast } = useToast();

  const form = useForm<ProfessionalFormData>({
    resolver: zodResolver(professionalSchema),
    defaultValues: {
      email: '',
      specialty: '',
      crp: '',
      phone: '',
      bio: '',
      status: 'active'
    }
  });

  const fetchProfessionals = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`http://localhost:3000/api/professionals?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setProfessionals(data);
      }
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao carregar profissionais',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfessionals();
  }, [searchQuery, statusFilter]);

  const handleSubmit = async (data: ProfessionalFormData) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const url = editingProfessional 
        ? `http://localhost:3000/api/professionals/${editingProfessional.id}`
        : 'http://localhost:3000/api/professionals';
      
      const method = editingProfessional ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        toast({
          title: 'Sucesso',
          description: `Profissional ${editingProfessional ? 'atualizado' : 'criado'} com sucesso`
        });
        setDialogOpen(false);
        setEditingProfessional(null);
        form.reset();
        fetchProfessionals();
      } else {
        const error = await response.json();
        toast({
          title: 'Erro',
          description: error.error || 'Erro ao salvar profissional',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro interno do servidor',
        variant: 'destructive'
      });
    }
  };

  const handleToggleStatus = async (professional: Professional) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const newStatus = professional.status === 'active' ? 'inactive' : 'active';

      const response = await fetch(`http://localhost:3000/api/professionals/${professional.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        toast({
          title: 'Sucesso',
          description: `Profissional ${newStatus === 'active' ? 'ativado' : 'inativado'} com sucesso`
        });
        fetchProfessionals();
      }
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao alterar status do profissional',
        variant: 'destructive'
      });
    }
  };

  const handleEdit = (professional: Professional) => {
    setEditingProfessional(professional);
    form.reset({
      email: professional.email,
      specialty: professional.specialty || '',
      crp: professional.crp || '',
      phone: professional.phone || '',
      bio: professional.bio || '',
      status: professional.status
    });
    setDialogOpen(true);
  };

  const handleDeactivate = async (professional: Professional) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`http://localhost:3000/api/professionals/${professional.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast({
          title: 'Sucesso',
          description: 'Profissional inativado com sucesso'
        });
        fetchProfessionals();
      }
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao inativar profissional',
        variant: 'destructive'
      });
    }
  };

  const openCreateDialog = () => {
    setEditingProfessional(null);
    form.reset();
    setDialogOpen(true);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Gestão de Profissionais</h1>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Profissional
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingProfessional ? 'Editar Profissional' : 'Novo Profissional'}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="specialty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Especialidade</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="crp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CRP</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Biografia</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="inactive">Inativo</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit">Salvar</Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por email ou especialidade..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Especialidade</TableHead>
              <TableHead>CRP</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : professionals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Nenhum profissional encontrado
                </TableCell>
              </TableRow>
            ) : (
              professionals.map((professional) => (
                <TableRow key={professional.id}>
                  <TableCell className="font-medium">{professional.email}</TableCell>
                  <TableCell>{professional.specialty || '-'}</TableCell>
                  <TableCell>{professional.crp || '-'}</TableCell>
                  <TableCell>{professional.phone || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={professional.status === 'active' ? 'default' : 'secondary'}>
                      {professional.status === 'active' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEdit(professional)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleToggleStatus(professional)}
                      >
                        {professional.status === 'active' ? (
                          <UserX className="h-4 w-4" />
                        ) : (
                          <UserCheck className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}