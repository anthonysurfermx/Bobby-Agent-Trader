import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Eye, Plus, X, MapPin, Clock, Users, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface Speaker {
  id: string;
  name: string;
  title: string;
  company: string;
  bio: string;
  photo: string;
  linkedin: string;
  twitter: string;
  topic: string;
}

interface Sponsor {
  id: string;
  name: string;
  logo: string;
  website: string;
  level: "platinum" | "gold" | "silver";
}

interface EventFormData {
  name: string;
  type: string;
  description: string;
  detailedDescription: string;
  banner: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timezone: string;
  modality: "presencial" | "online" | "hibrido";
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueZipCode: string;
  googleMapsLink: string;
  platform: string;
  accessLink: string;
  password: string;
  meetingId: string;
  requiresRegistration: boolean;
  maxCapacity: number;
  price: number;
  earlyBirdPrice: number;
  earlyBirdDeadline: string;
  registrationLink: string;
  speakers: Speaker[];
  sponsors: Sponsor[];
  sendReminders: boolean;
  generateCertificates: boolean;
  recordSession: boolean;
  waitingList: boolean;
}

const AdminEventForm = () => {
  const { toast } = useToast();
  const [isPreview, setIsPreview] = useState(false);
  
  const [formData, setFormData] = useState<EventFormData>({
    name: "",
    type: "",
    description: "",
    detailedDescription: "",
    banner: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    timezone: "America/Mexico_City",
    modality: "presencial",
    venueName: "",
    venueAddress: "",
    venueCity: "",
    venueZipCode: "",
    googleMapsLink: "",
    platform: "",
    accessLink: "",
    password: "",
    meetingId: "",
    requiresRegistration: true,
    maxCapacity: 50,
    price: 0,
    earlyBirdPrice: 0,
    earlyBirdDeadline: "",
    registrationLink: "",
    speakers: [],
    sponsors: [],
    sendReminders: true,
    generateCertificates: false,
    recordSession: false,
    waitingList: true
  });

  const eventTypes = ["Workshop", "Meetup", "Hackathon", "Conferencia", "Curso", "Webinar"];
  const platforms = ["Zoom", "Google Meet", "Teams", "Discord", "YouTube Live"];
  const timezones = ["America/Mexico_City", "America/New_York", "Europe/London", "UTC"];

  const handleInputChange = (field: keyof EventFormData, value: string | number | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const addSpeaker = () => {
    const newSpeaker: Speaker = {
      id: Date.now().toString(),
      name: "",
      title: "",
      company: "",
      bio: "",
      photo: "",
      linkedin: "",
      twitter: "",
      topic: ""
    };
    setFormData(prev => ({
      ...prev,
      speakers: [...prev.speakers, newSpeaker]
    }));
  };

  const updateSpeaker = (id: string, field: keyof Speaker, value: string) => {
    setFormData(prev => ({
      ...prev,
      speakers: prev.speakers.map(speaker =>
        speaker.id === id ? { ...speaker, [field]: value } : speaker
      )
    }));
  };

  const removeSpeaker = (id: string) => {
    setFormData(prev => ({
      ...prev,
      speakers: prev.speakers.filter(speaker => speaker.id !== id)
    }));
  };

  const addSponsor = () => {
    const newSponsor: Sponsor = {
      id: Date.now().toString(),
      name: "",
      logo: "",
      website: "",
      level: "silver"
    };
    setFormData(prev => ({
      ...prev,
      sponsors: [...prev.sponsors, newSponsor]
    }));
  };

  const updateSponsor = (id: string, field: keyof Sponsor, value: string) => {
    setFormData(prev => ({
      ...prev,
      sponsors: prev.sponsors.map(sponsor =>
        sponsor.id === id ? { ...sponsor, [field]: value } : sponsor
      )
    }));
  };

  const removeSponsor = (id: string) => {
    setFormData(prev => ({
      ...prev,
      sponsors: prev.sponsors.filter(sponsor => sponsor.id !== id)
    }));
  };

  const handleSaveDraft = () => {
    toast({
      title: "Borrador guardado",
      description: "El evento se ha guardado como borrador.",
    });
  };

  const handlePublish = () => {
    toast({
      title: "Evento publicado",
      description: "El evento ha sido publicado exitosamente.",
    });
  };

  const formatEventDate = () => {
    if (!formData.startDate) return "Fecha por definir";
    const date = new Date(formData.startDate);
    return date.toLocaleDateString("es-MX", { 
      weekday: "long", 
      year: "numeric", 
      month: "long", 
      day: "numeric" 
    });
  };

  // Preview Card Component
  const PreviewCard = () => (
    <Card className="bg-gradient-dark border-border hover:border-primary/30 transition-all duration-300">
      <CardContent className="p-0">
        {formData.banner && (
          <div className="aspect-video bg-muted rounded-t-lg overflow-hidden">
            <img 
              src={formData.banner} 
              alt={formData.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="secondary" className="text-xs">
              {formData.type || "Evento"}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {formData.modality === "presencial" ? "🏢 Presencial" : 
               formData.modality === "online" ? "💻 Online" : "🔄 Híbrido"}
            </Badge>
          </div>
          
          <h3 className="text-lg font-semibold text-foreground mb-2 line-clamp-2">
            {formData.name || "Nombre del evento"}
          </h3>
          
          <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
            {formData.description || "Descripción del evento..."}
          </p>
          
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>{formatEventDate()}</span>
              {formData.startTime && <span>a las {formData.startTime}</span>}
            </div>
            
            {formData.modality !== "online" && formData.venueName && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>{formData.venueName}</span>
              </div>
            )}
            
            {formData.requiresRegistration && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>
                  {formData.price > 0 ? `$${formData.price} MXN` : "Gratis"} - 
                  Capacidad: {formData.maxCapacity}
                </span>
              </div>
            )}
          </div>
          
          <Button className="w-full">
            {formData.requiresRegistration ? "Registrarse" : "Más información"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/eventos">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Nuevo Evento</h1>
            <p className="text-muted-foreground">
              Crea un nuevo evento para la comunidad
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            onClick={() => setIsPreview(!isPreview)}
            className="flex items-center"
          >
            <Eye className="w-4 h-4 mr-2" />
            {isPreview ? "Editar" : "Preview"}
          </Button>
          <Button variant="outline" onClick={handleSaveDraft}>
            <Save className="w-4 h-4 mr-2" />
            Guardar Borrador
          </Button>
          <Button onClick={handlePublish} className="bg-gradient-primary text-primary-foreground">
            Publicar Evento
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2">
          {isPreview ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="flex justify-center"
            >
              <PreviewCard />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Tabs defaultValue="info" className="space-y-6">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="info">Información</TabsTrigger>
                  <TabsTrigger value="datetime">Fecha y Lugar</TabsTrigger>
                  <TabsTrigger value="registration">Registro</TabsTrigger>
                  <TabsTrigger value="speakers">Ponentes</TabsTrigger>
                  <TabsTrigger value="partners">Partners</TabsTrigger>
                </TabsList>

                <TabsContent value="info">
                  <Card>
                    <CardHeader>
                      <CardTitle>Detalles del Evento</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Nombre del Evento *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => handleInputChange("name", e.target.value)}
                          placeholder="Nombre del evento..."
                          className="text-lg font-medium"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="type">Tipo de Evento *</Label>
                        <Select value={formData.type} onValueChange={(value) => handleInputChange("type", value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            {eventTypes.map(type => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description">Descripción *</Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => handleInputChange("description", e.target.value)}
                          placeholder="Describe de qué trata el evento..."
                          rows={3}
                          minLength={100}
                        />
                        <div className="text-xs text-muted-foreground">
                          Mínimo 100 caracteres ({formData.description.length}/100)
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="detailedDescription">Descripción Detallada</Label>
                        <Textarea
                          id="detailedDescription"
                          value={formData.detailedDescription}
                          onChange={(e) => handleInputChange("detailedDescription", e.target.value)}
                          placeholder="Agenda, temas a tratar, información adicional..."
                          rows={6}
                          className="font-mono"
                        />
                        <div className="text-xs text-muted-foreground">
                          Incluir agenda, temas a tratar, etc. Soporta Markdown.
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="banner">Banner del Evento</Label>
                        <Input
                          id="banner"
                          type="url"
                          value={formData.banner}
                          onChange={(e) => handleInputChange("banner", e.target.value)}
                          placeholder="https://ejemplo.com/banner.jpg"
                        />
                        <div className="text-xs text-muted-foreground">
                          Dimensiones recomendadas: 1920x1080px
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="datetime">
                  <Card>
                    <CardHeader>
                      <CardTitle>Cuándo y Dónde</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-4">
                          <h4 className="font-medium text-foreground">Fecha y Hora</h4>
                          <div className="space-y-2">
                            <Label htmlFor="startDate">Fecha de Inicio *</Label>
                            <Input
                              id="startDate"
                              type="date"
                              value={formData.startDate}
                              onChange={(e) => handleInputChange("startDate", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="startTime">Hora de Inicio *</Label>
                            <Input
                              id="startTime"
                              type="time"
                              value={formData.startTime}
                              onChange={(e) => handleInputChange("startTime", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="endDate">Fecha de Fin</Label>
                            <Input
                              id="endDate"
                              type="date"
                              value={formData.endDate}
                              onChange={(e) => handleInputChange("endDate", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="endTime">Hora de Fin</Label>
                            <Input
                              id="endTime"
                              type="time"
                              value={formData.endTime}
                              onChange={(e) => handleInputChange("endTime", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="timezone">Zona Horaria</Label>
                            <Select value={formData.timezone} onValueChange={(value) => handleInputChange("timezone", value)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {timezones.map(tz => (
                                  <SelectItem key={tz} value={tz}>
                                    {tz}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-4">
                            <Label>Modalidad *</Label>
                            <div className="flex flex-col gap-3">
                              {[
                                { value: "presencial", label: "🏢 Presencial", icon: "🏢" },
                                { value: "online", label: "💻 Online", icon: "💻" },
                                { value: "hibrido", label: "🔄 Híbrido", icon: "🔄" }
                              ].map((option) => (
                                <div key={option.value} className="flex items-center space-x-2">
                                  <input
                                    type="radio"
                                    id={option.value}
                                    name="modality"
                                    checked={formData.modality === option.value}
                                    onChange={() => handleInputChange("modality", option.value)}
                                  />
                                  <Label htmlFor={option.value} className="flex items-center gap-2">
                                    {option.label}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </div>

                          {(formData.modality === "presencial" || formData.modality === "hibrido") && (
                            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                              <h5 className="font-medium text-sm">Información del Lugar</h5>
                              <Input
                                placeholder="Nombre del lugar"
                                value={formData.venueName}
                                onChange={(e) => handleInputChange("venueName", e.target.value)}
                              />
                              <Input
                                placeholder="Dirección completa"
                                value={formData.venueAddress}
                                onChange={(e) => handleInputChange("venueAddress", e.target.value)}
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  placeholder="Ciudad"
                                  value={formData.venueCity}
                                  onChange={(e) => handleInputChange("venueCity", e.target.value)}
                                />
                                <Input
                                  placeholder="Código Postal"
                                  value={formData.venueZipCode}
                                  onChange={(e) => handleInputChange("venueZipCode", e.target.value)}
                                />
                              </div>
                              <Input
                                placeholder="Link de Google Maps"
                                value={formData.googleMapsLink}
                                onChange={(e) => handleInputChange("googleMapsLink", e.target.value)}
                              />
                            </div>
                          )}

                          {(formData.modality === "online" || formData.modality === "hibrido") && (
                            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                              <h5 className="font-medium text-sm">Información Online</h5>
                              <Select value={formData.platform} onValueChange={(value) => handleInputChange("platform", value)}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar plataforma" />
                                </SelectTrigger>
                                <SelectContent>
                                  {platforms.map(platform => (
                                    <SelectItem key={platform} value={platform}>
                                      {platform}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                placeholder="Link de Acceso *"
                                value={formData.accessLink}
                                onChange={(e) => handleInputChange("accessLink", e.target.value)}
                              />
                              <Input
                                placeholder="Contraseña (opcional)"
                                value={formData.password}
                                onChange={(e) => handleInputChange("password", e.target.value)}
                              />
                              <Input
                                placeholder="ID de Reunión"
                                value={formData.meetingId}
                                onChange={(e) => handleInputChange("meetingId", e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="registration">
                  <Card>
                    <CardHeader>
                      <CardTitle>Configuración de Registro</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="requiresRegistration">Requiere Registro</Label>
                        <Switch
                          id="requiresRegistration"
                          checked={formData.requiresRegistration}
                          onCheckedChange={(checked) => handleInputChange("requiresRegistration", checked)}
                        />
                      </div>

                      {formData.requiresRegistration && (
                        <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="maxCapacity">Capacidad Máxima</Label>
                              <Input
                                id="maxCapacity"
                                type="number"
                                min="1"
                                value={formData.maxCapacity}
                                onChange={(e) => handleInputChange("maxCapacity", parseInt(e.target.value))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="price">Precio (MXN)</Label>
                              <Input
                                id="price"
                                type="number"
                                min="0"
                                step="0.01"
                                value={formData.price}
                                onChange={(e) => handleInputChange("price", parseFloat(e.target.value))}
                                placeholder="0 = Gratuito"
                              />
                            </div>
                          </div>

                          {formData.price > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="earlyBirdPrice">Precio Early Bird</Label>
                                <Input
                                  id="earlyBirdPrice"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={formData.earlyBirdPrice}
                                  onChange={(e) => handleInputChange("earlyBirdPrice", parseFloat(e.target.value))}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="earlyBirdDeadline">Fecha límite Early Bird</Label>
                                <Input
                                  id="earlyBirdDeadline"
                                  type="date"
                                  value={formData.earlyBirdDeadline}
                                  onChange={(e) => handleInputChange("earlyBirdDeadline", e.target.value)}
                                />
                              </div>
                            </div>
                          )}

                          <div className="space-y-2">
                            <Label htmlFor="registrationLink">Link de Registro Externo</Label>
                            <Input
                              id="registrationLink"
                              type="url"
                              value={formData.registrationLink}
                              onChange={(e) => handleInputChange("registrationLink", e.target.value)}
                              placeholder="https://eventbrite.com/..."
                            />
                            <div className="text-xs text-muted-foreground">
                              O usar sistema de registro interno
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="speakers">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        Speakers y Moderadores
                        <Button onClick={addSpeaker} size="sm">
                          <Plus className="w-4 h-4 mr-2" />
                          Agregar Ponente
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {formData.speakers.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          No hay ponentes agregados. Haz clic en "Agregar Ponente" para comenzar.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {formData.speakers.map((speaker, index) => (
                            <Card key={speaker.id} className="p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-medium">Ponente #{index + 1}</h4>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeSpeaker(speaker.id)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                  placeholder="Nombre *"
                                  value={speaker.name}
                                  onChange={(e) => updateSpeaker(speaker.id, "name", e.target.value)}
                                />
                                <Input
                                  placeholder="Cargo/Título"
                                  value={speaker.title}
                                  onChange={(e) => updateSpeaker(speaker.id, "title", e.target.value)}
                                />
                                <Input
                                  placeholder="Empresa"
                                  value={speaker.company}
                                  onChange={(e) => updateSpeaker(speaker.id, "company", e.target.value)}
                                />
                                <Input
                                  placeholder="URL de la foto"
                                  value={speaker.photo}
                                  onChange={(e) => updateSpeaker(speaker.id, "photo", e.target.value)}
                                />
                                <Input
                                  placeholder="LinkedIn URL"
                                  value={speaker.linkedin}
                                  onChange={(e) => updateSpeaker(speaker.id, "linkedin", e.target.value)}
                                />
                                <Input
                                  placeholder="Twitter URL"
                                  value={speaker.twitter}
                                  onChange={(e) => updateSpeaker(speaker.id, "twitter", e.target.value)}
                                />
                              </div>
                              <div className="mt-4 space-y-2">
                                <Textarea
                                  placeholder="Bio (máx 200 caracteres)"
                                  value={speaker.bio}
                                  onChange={(e) => updateSpeaker(speaker.id, "bio", e.target.value)}
                                  maxLength={200}
                                  rows={2}
                                />
                                <div className="text-xs text-muted-foreground text-right">
                                  {speaker.bio.length}/200 caracteres
                                </div>
                                <Input
                                  placeholder="Tema de la charla"
                                  value={speaker.topic}
                                  onChange={(e) => updateSpeaker(speaker.id, "topic", e.target.value)}
                                />
                              </div>
                            </Card>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="partners">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        Patrocinadores y Aliados
                        <Button onClick={addSponsor} size="sm">
                          <Plus className="w-4 h-4 mr-2" />
                          Agregar Sponsor
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {formData.sponsors.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          No hay patrocinadores agregados. Haz clic en "Agregar Sponsor" para comenzar.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {["platinum", "gold", "silver"].map((level) => {
                            const levelSponsors = formData.sponsors.filter(s => s.level === level);
                            return (
                              <div key={level}>
                                <h4 className="font-medium mb-2 capitalize">
                                  {level} ({levelSponsors.length})
                                </h4>
                                {levelSponsors.map((sponsor) => (
                                  <Card key={sponsor.id} className="p-4">
                                    <div className="flex items-center justify-between mb-3">
                                      <Badge variant="outline" className="capitalize">
                                        {sponsor.level}
                                      </Badge>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeSponsor(sponsor.id)}
                                        className="text-destructive hover:text-destructive"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <Input
                                        placeholder="Nombre de la empresa"
                                        value={sponsor.name}
                                        onChange={(e) => updateSponsor(sponsor.id, "name", e.target.value)}
                                      />
                                      <Input
                                        placeholder="URL del logo"
                                        value={sponsor.logo}
                                        onChange={(e) => updateSponsor(sponsor.id, "logo", e.target.value)}
                                      />
                                      <Input
                                        placeholder="Website"
                                        value={sponsor.website}
                                        onChange={(e) => updateSponsor(sponsor.id, "website", e.target.value)}
                                      />
                                    </div>
                                    <div className="mt-2">
                                      <Select 
                                        value={sponsor.level} 
                                        onValueChange={(value) => updateSponsor(sponsor.id, "level", value)}
                                      >
                                        <SelectTrigger className="w-full">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="platinum">Platinum</SelectItem>
                                          <SelectItem value="gold">Gold</SelectItem>
                                          <SelectItem value="silver">Silver</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </Card>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </div>

        {/* Live Preview and Settings */}
        {!isPreview && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="lg:col-span-1 space-y-4"
          >
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="text-sm">Vista Previa del Evento</CardTitle>
              </CardHeader>
              <CardContent>
                <PreviewCard />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Configuración Adicional</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sendReminders">Enviar recordatorios</Label>
                  <Switch
                    id="sendReminders"
                    checked={formData.sendReminders}
                    onCheckedChange={(checked) => handleInputChange("sendReminders", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="generateCertificates">Generar certificados</Label>
                  <Switch
                    id="generateCertificates"
                    checked={formData.generateCertificates}
                    onCheckedChange={(checked) => handleInputChange("generateCertificates", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="recordSession">Grabar sesión</Label>
                  <Switch
                    id="recordSession"
                    checked={formData.recordSession}
                    onCheckedChange={(checked) => handleInputChange("recordSession", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="waitingList">Lista de espera si se llena</Label>
                  <Switch
                    id="waitingList"
                    checked={formData.waitingList}
                    onCheckedChange={(checked) => handleInputChange("waitingList", checked)}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default AdminEventForm;